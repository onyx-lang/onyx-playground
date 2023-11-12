let open_fds = {};
let open_dirs = {};
let next_fd = 3;
let next_dir_fd = 0;

function fs_reset() {
    open_fds = {};
    next_fd = 3;
}

function fs_handler(data) {
    let fs_response = new DataView(fs_shared_buffer);

    switch (data.action) {
        case 'open': {
            let item = folders.lookup(data.path);
            if (!item && data.mode == 'write') {
                item = folders.create_file(data.path, "");
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
                delete open_fds[data.fd];
                RESPOND_WITH_RESULT(1);
            }

            RESPOND_WITH_RESULT(0);
            break;
        }

        case 'rename': {
            // TODO: block renaming if a FD is open for the oldname
            let result = folders.move_file(data.oldname, data.newname);
            folder_rebuild_view();
            RESPOND_WITH_RESULT(result ? 1 : 0);
            break;
        }

        case 'remove': {
            // TODO: block removing if a FD is open for the name
            let result = folders.remove(data.name);
            folder_rebuild_view();
            RESPOND_WITH_RESULT(result ? 1 : 0);
            break;
        }

        case 'exists': {
            let exists = folders.lookup(data.name);
            RESPOND_WITH_RESULT(exists != null ? 1 : 0);
            break;
        }

        case 'stat': {
            let item = folders.lookup(data.name);
            if (!item) {
                fs_response.setBigInt64(8, 0);
                fs_response.setUint32(16, 0);
                RESPOND_WITH_RESULT(0);
                break;
            }

            fs_response.setBigInt64(8, item.type == 'file' ? BigInt(item.contents.length) : 0, true);
            fs_response.setUint32(16, item.type == 'file' ? 4 : 3, true);
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

            folders.save();
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
            
            if (item.type == 'file') fs_response.setInt32(8, 4, true);
            else                     fs_response.setInt32(8, 3, true);

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
