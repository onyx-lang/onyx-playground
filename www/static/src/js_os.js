let open_fds = {};
let open_dirs = {};
let next_fd = 3;
let next_dir_fd = 0;

function fs_reset() {
    open_fds = {};
    open_dirs = {};
    next_fd = 3;
    next_dir_fd = 0;
}

function fs_handler(data) {
    let fs_response = new DataView(fs_shared_buffer);

    switch (data.action) {
        case 'open': {
            let item = folders.lookup(data.path);
            if (!item && data.mode == 'write') {
                item = folders.create_file(data.path, "");
                folders.save();
                folder_rebuild_view();
            }

            if (!item || item.type != 'file') {
                RESPOND_WITH_RESULT(0);
                break;
            }
            
            let fd = next_fd++;
            open_fds[fd] = {
                path: data.path,
                cursor: 0,
                mode: data.mode,
                item_ref: item
            };

            fs_response.setInt32(8, fd, true);
            RESPOND_WITH_RESULT(1);
            break;
        }

        case 'close': {
            if (Object.keys(open_fds).some(x => x == data.fd)) {
                folders.save();
                delete open_fds[data.fd];
                RESPOND_WITH_RESULT(1);
            }

            RESPOND_WITH_RESULT(0);
            break;
        }

        case 'rename': {
            // TODO: block renaming if a FD is open for the oldname
            let result = folders.move_file(data.oldname, data.newname);
            folders.save();
            folder_rebuild_view();
            RESPOND_WITH_RESULT(result ? 1 : 0);
            break;
        }

        case 'remove': {
            // TODO: block removing if a FD is open for the name
            let result = folders.remove(data.name);
            folders.save();
            folder_rebuild_view();
            RESPOND_WITH_RESULT(result ? 1 : 0);
            break;
        }

        case 'exists': {
            let exists = folders.lookup(data.name);
            RESPOND_WITH_RESULT(exists != null ? 1 : 0);
            break;
        }

        case 'stat':
        case 'lstat': {
            let item = folders.lookup(data.name, { follow: data.action != 'lstat' });
            if (!item) {
                RESPOND_WITH_RESULT(0);
                break;
            }

            let type = 0;
            let size = 0;
            if (item.type == 'file') {
                type = 4;
                size = item.contents.length;
            } else if (item.type == 'dir') {
                type = 3;
            } else if (item.type == 'symlink') {
                type = 5;
                size = item.contents.length;
            }

            fs_response.setBigInt64(8, BigInt(size), true);
            fs_response.setUint32(16, type, true);
            fs_response.setBigUint64(24, 0n, true);
            fs_response.setBigUint64(32, 0n, true);
            fs_response.setBigUint64(40, 0n, true);
            RESPOND_WITH_RESULT(1);
            break;
        }

        case 'symlink': {
            let ok = folders.create_symlink(data.link_path, data.target);
            if (ok) {
                folders.save();
                folder_rebuild_view();
            }
            RESPOND_WITH_RESULT(ok ? 1 : 0);
            break;
        }

        case 'link': {
            let ok = folders.link(data.target, data.link_path);
            if (ok) {
                folders.save();
                folder_rebuild_view();
            }
            RESPOND_WITH_RESULT(ok ? 1 : 0);
            break;
        }

        case 'readlink': {
            let item = folders.lookup(data.name, { follow: false });
            if (!item || item.type != 'symlink') {
                RESPOND_WITH_RESULT(-1);
                break;
            }

            let encoded = new TextEncoder().encode(item.contents);
            new Uint8Array(fs_shared_buffer).set(encoded, 8);
            RESPOND_WITH_RESULT(encoded.length);
            break;
        }

        case 'truncate': {
            let fd = open_fds[data.fd];
            if (!fd || fd.item_ref.type != 'file' || data.size < 0) {
                RESPOND_WITH_RESULT(0);
                break;
            }

            let contents = fd.item_ref.contents;
            if (data.size < contents.length) {
                fd.item_ref.contents = contents.slice(0, data.size);
            } else if (data.size > contents.length) {
                fd.item_ref.contents = contents + "\0".repeat(data.size - contents.length);
            }

            fd.cursor = Math.min(fd.cursor, fd.item_ref.contents.length);
            editor.changeTabContents(fd.path, fd.item_ref.contents);
            RESPOND_WITH_RESULT(1);
            break;
        }

        case 'seek': {
            if (open_fds[data.fd] == null) {
                RESPOND_WITH_RESULT(-1);
                break;
            }

            let fd = open_fds[data.fd];

            let new_offset = -1;
            switch (data.whence) {
                case 'start':   new_offset = data.to; break;
                case 'current': new_offset = fd.cursor + data.to; break;
                case 'end':     new_offset = fd.item_ref.contents.length - data.to; break;
            }

            if (new_offset < 0) {
                new_offset = -1;
            } else {
                fd.cursor = new_offset;
            }

            RESPOND_WITH_RESULT(new_offset);
            break;
        }

        case 'tell': {
            let pos = open_fds[data.fd]?.cursor ?? 0;
            RESPOND_WITH_RESULT(pos);
            break;
        }

        case 'size': {
            let size = open_fds[data.fd]?.item_ref.contents.length ?? 0;
            RESPOND_WITH_RESULT(size);
            break;
        }

        case 'write': {
            let fd = open_fds[data.fd];
            if (!fd || fd.mode != 'write') {
                RESPOND_WITH_RESULT(-1);
                break;
            }

            if (fd.cursor == fd.item_ref.contents.length) {
                fd.item_ref.contents = fd.item_ref.contents + data.content;
            } else {
                fd.item_ref.contents =
                    fd.item_ref.contents.slice(0, fd.cursor)
                    + data.content
                    + fd.item_ref.contents.slice(fd.cursor);
            }

            fd.cursor += data.content.length;

            editor.changeTabContents(fd.path, fd.item_ref.contents);
            RESPOND_WITH_RESULT(data.content.length);
            break;
        }

        case 'read': {
            let fd = open_fds[data.fd];
            if (!fd || fd.mode == 'write') {
                RESPOND_WITH_RESULT(-1);
                break;
            }

            if (fd.cursor >= fd.item_ref.contents.length) {
                RESPOND_WITH_RESULT(-1);
                break;
            }

            let length = Math.min(data.max_length, 4096);

            let encoder = new TextEncoder();
            let encoded = encoder.encode(fd.item_ref.contents.slice(fd.cursor, fd.cursor + length));
            fd.cursor += encoded.length;

            let fs_array = new Uint8Array(fs_shared_buffer);
            fs_array.set(encoded, 8); // 1 integer offset for the response result

            RESPOND_WITH_RESULT(encoded.length);
            break;
        }

        case 'dir_remove': {
            RESPOND_WITH_RESULT(folders.remove(data.path) ? 1 : 0);
            folders.save();
            folder_rebuild_view();
            break;
        }

        case 'dir_create': {
            folders.create_directory(data.path);
            folders.save();
            folder_rebuild_view();
            RESPOND_WITH_RESULT(1);
            break;
        }

        case 'dir_open': {
            let dir = folders.lookup(data.path);
            if (!dir) {
                RESPOND_WITH_RESULT(-1);
                break;
            }

            let dir_fd = next_dir_fd++;
            open_dirs[dir_fd] = {
                item_cursor: 0,
                dir_ref: dir
            };

            RESPOND_WITH_RESULT(dir_fd);
            break;
        }

        case 'dir_close': {
            if (Object.keys(open_dirs).some(x => x == data.fd)) {
                delete open_dirs[data.fd];
            }

            RESPOND_WITH_RESULT(1);
            break;
        }

        case 'dir_read': {
            let dir_fd = open_dirs[data.fd];
            if (!dir_fd) {
                RESPOND_WITH_RESULT(0);
                break;
            }

            if (dir_fd.item_cursor >= dir_fd.dir_ref.elems.length) {
                RESPOND_WITH_RESULT(0);
                break;
            }

            let item = dir_fd.dir_ref.elems[dir_fd.item_cursor++];

            let entry_type = 0;
            if (item.type == 'file') entry_type = 4;
            else if (item.type == 'dir') entry_type = 3;
            else if (item.type == 'symlink') entry_type = 5;
            fs_response.setInt32(8, entry_type, true);

            fs_response.setInt32(12, Math.min(255, item.name.length), true);

            new Uint8Array(fs_shared_buffer).set(
                new TextEncoder().encode(item.name).slice(0, 255),
                16
            );

            RESPOND_WITH_RESULT(1);
            break;
        }
    }
}

function RESPOND_WITH_RESULT(result) {
    let fs_data = new Int32Array(fs_shared_buffer);
    Atomics.store(fs_data, 1, result);
    Atomics.store(fs_data, 0, 1);
    Atomics.notify(fs_data, 0);
}
