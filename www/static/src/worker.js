let input_shared_buffer = null;
let canvas_data_buffer = null;
let fs_shared_buffer = null;
let wasm_memory = null;

function S(strptr, strlen) {
    let strdata = new Uint8Array(wasm_memory.buffer, strptr, strlen);
    return new TextDecoder().decode(strdata);
}

function FS_ACTION(action, data) {
    self.postMessage({
        type: 'fs',
        data: { action, ...data }
    });

    let fs_data = new Int32Array(fs_shared_buffer);
    Atomics.store(fs_data, 0, 0);
    Atomics.wait(fs_data, 0, 0);

    let result = Atomics.load(fs_data, 1);
    return result;
}

let canvas_order_id = 0;

let import_obj = {
    host: {
        print_str(strptr, strlen) {
            let str = S(strptr, strlen);
            self.postMessage({ type: 'print_str', data: str });
        },

        time_now() {
            return Date.now();
        },

        time() {
            return BigInt(Date.now());
        },

        read_line_available: function() {
            self.postMessage({ type: 'show_input', data: null });

            let input_array = new Int32Array(input_shared_buffer);
            Atomics.store(input_array, 0, 0);
            Atomics.wait(input_array, 0, 0);
        },

        read_line(msgptr, msglen) { // Returns actual length
            let data = new Uint8Array(wasm_memory.buffer, msgptr, msglen);
            let input_array = new Uint8Array(input_shared_buffer);

            let i;
            for (i=0; input_array[i + 4] != 0 && i<msglen; i++) {
                data[i] = input_array[i + 4];
            }

            let atomic_stuff = new Int32Array(input_shared_buffer);
            Atomics.store(atomic_stuff, 0, 0);

            return i;
        },

        exit(code) {
            self.postMessage({ type: 'terminated' });
            self.close();
            while (1) {}
        },
    },

    host_fs: {
        __file_open_impl(path_ptr, path_len, mode, outptr) {
            let path = S(path_ptr, path_len);

            let result = FS_ACTION('open', {
                path: path,
                mode: mode == 1 ? 'read' : 'write',
            })

            if (result == 0) {
                return 0;
            }

            let data = new DataView(wasm_memory.buffer);
            let fs_response = new DataView(fs_shared_buffer);
            data.setInt32(outptr, fs_response.getInt32(8, true), true);

            return 1;
        },

        __file_close_impl(fd) {
            return FS_ACTION('close', { fd: String(fd) }) == 1;
        },

        __file_rename(old_name_ptr, old_name_len, new_name_ptr, new_name_len) {
            let oldname = S(old_name_ptr, old_name_len);
            let newname = S(new_name_ptr, new_name_len);

            return FS_ACTION('rename', { oldname, newname }) == 1;
        },

        __file_remove(name_ptr, name_len) {
            let name = S(name_ptr, name_len);

            return FS_ACTION('remove', { name }) == 1;
        },

        __file_exists(name_ptr, name_len) {
            let name = S(name_ptr, name_len);

            return FS_ACTION('exists', { name }) == 1;
        },

        __file_stat(name_ptr, name_len, outptr) {
            let name = S(name_ptr, name_len);

            let result = FS_ACTION('stat', { name });
            if (result > 0) {
                let data = new DataView(wasm_memory.buffer);
                let fs_response = new DataView(fs_shared_buffer);

                data.setBigInt64(outptr, fs_response.getBigInt64(8, true), true);
                data.setUint32(outptr + 8, fs_response.getUint32(16, true), true);
                return 1;
            }

            return 0;
        },

        __file_seek(fd, to, whence) {
            const whence_map = [
                'start',
                'current',
                'end'
            ];

            return FS_ACTION('seek', { fd, to, whence: whence_map[whence] });
        },

        __file_tell(fd) {
            return FS_ACTION('tell', { fd });
        },

        __file_size(fd) {
            return FS_ACTION('size', { fd });
        },

        __file_read(fd, output_ptr, output_len, bytes_read_ptr) {
            let fs_data = new Uint8Array(fs_shared_buffer);
            let wasm_data = new Uint8Array(wasm_memory.buffer);

            let bytes_to_read = output_len;
            let bytes_read = 0;
            while (bytes_to_read > 0) {
                let result = FS_ACTION('read', { fd, max_length: bytes_to_read });
                if (result == -1) break;

                wasm_data.set(fs_data.slice(8, 8 + result), output_ptr + bytes_read);
                bytes_read += result;
                bytes_to_read -= result;
            }

            new DataView(wasm_memory.buffer).setBigUint64(bytes_read_ptr, BigInt(bytes_read), true);

            if (bytes_to_read == 0) {
                return 0;
            }

            return 6;
        },

        __file_write(fd, input_ptr, input_len, bytes_wrote_ptr) {
            let input = S(input_ptr, input_len);

            let result = FS_ACTION('write', { fd, content: input });
            if (result < 0) {
                return 6;
            }

            let data = new DataView(wasm_memory.buffer);
            data.setBigUint64(bytes_wrote_ptr, BigInt(result), true);

            return 0;
        },

        __dir_open(path_ptr, path_len, out_ptr) {
            let path = S(path_ptr, path_len);
            let result = FS_ACTION('dir_open', { path });

            if (result == -1) {
                return 0;
            }

            let data = new DataView(wasm_memory.buffer);
            data.setUint32(out_ptr, result, true);
            return 1;
        },

        __dir_close(fd) {
            FS_ACTION('dir_close', { fd });
        },

        __dir_read(fd, out_ptr) {
            let result = FS_ACTION('dir_read', { fd });
            if (result == 0) {
                return 0;
            }

            // Byte Layout:
            // 08-11: Type (3 is dir, 4 is file)
            // 12-15: name length
            // 16...: name

            let fs_data = new DataView(fs_shared_buffer);
            let data = new DataView(wasm_memory.buffer);

            let name_length = fs_data.getInt32(12, true);

            data.setInt32(out_ptr + 0, fs_data.getInt32(8, true), true);
            data.setInt32(out_ptr + 8, name_length, true);

            new Uint8Array(wasm_memory.buffer).set(
                new Uint8Array(fs_shared_buffer).slice(16, 16 + name_length),
                out_ptr + 12
            );
            
            return 1;
        },

        __dir_create(path_ptr, path_len) {
            let path = S(path_ptr, path_len);
            return FS_ACTION('dir_create', { path }) == 1;
        },

        __dir_remove(path_ptr, path_len) {
            let path = S(path_ptr, path_len);
            return FS_ACTION('dir_remove', { path }) == 1;
        }
    },

    canvas: {
        init() {
            self.postMessage({ type: 'canvas', data: [ 0, 'init' ] });
            canvas_order_id = 0;

            // Issue a synchronization because the data needs to be correct
            // before control should be handed back to the running program.
            let canvas_data = new Int32Array(canvas_data_buffer);
            Atomics.wait(canvas_data, 2, 0);
            Atomics.store(canvas_data, 2, 0);
        },

        sync() {
            self.postMessage({ type: 'canvas', data: [ 0, 'sync'] });

            let canvas_data = new Int32Array(canvas_data_buffer);
            Atomics.wait(canvas_data, 2, 0);
            Atomics.store(canvas_data, 2, 0);
        },
        
        get_size(outwidth, outheight) {
            let data = new DataView(wasm_memory.buffer);
            let canvas_data = new Int32Array(canvas_data_buffer);

            data.setFloat32(outwidth, Atomics.load(canvas_data, 0), true);
            data.setFloat32(outheight, Atomics.load(canvas_data, 1), true);
        },

        // Settings
        fill_style(styleptr, stylelen) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'fill_style', S(styleptr, stylelen) ] }); },
        font(p, l) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'font', S(p, l) ] }); },
        image_smoothing_enabled(e) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'image_smoothing_enabled', e != 0 ] }); },
        line_join(join) {
            let method = "";
            switch (join) {
                case 1: method = "bevel"; break;
                case 2: method = "round"; break;
                case 3: method = "miter"; break;
            }

            if (method != "") {
                self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'line_join' , method ] });
            }
        },
        line_width(width) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'line_width', width ] }); },
        stroke_style(s, l) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'stroke_style', S(s, l) ] }); },
        text_align(align) {
            let method = "";
            switch (align) {
                case 1: method = "left"; break;
                case 2: method = "right"; break;
                case 3: method = "center"; break;
                case 4: method = "start"; break;
                case 5: method = "end"; break;
            }

            if (method != "") {
                self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'text_align' , method ] });
            }
        },

        // Drawing
        arc(x, y, r, sa, ea, cc) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'arc', x, y, r, sa, ea, cc != 0 ] }); },
        arc_to(x1, y1, x2, y2, r) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'arc_to', x1, y1, x2, y2, r ] }); },
        begin_path() { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'begin_path' ] }); },
        clear() { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'clear' ] }); },
        clear_rect(x, y, w, h) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'clear_rect', x, y, w, h ] }); },
        clip(cliprule) {
            let method = "";
            switch (cliprule) {
                case 1: method = "nonzero"; break;
                case 2: method = "evenodd"; break;
            }

            if (method != "") {
                self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'clip', method ] });
            }
        },
        close_path() { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'close_path' ] }); },
        ellipse(x, y, rx, ry, r, sa, ea, cc) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'ellipse', x, y, rx, ry, r, sa, ea, cc != 0 ] }); },
        fill(fillrule) {
            let method = "";
            switch (fillrule) {
                case 1: method = "nonzero"; break;
                case 2: method = "evenodd"; break;
            }

            if (method != "") {
                self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'fill', method ] });
            }
        },
        fill_rect(x, y, w, h) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'fill_rect', x, y, w, h ] }); },
        fill_text(textptr, textlen, x, y, max_width) {
            self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'fill_text', S(textptr, textlen), x, y, max_width > 0 ? max_width : null ] });
        },
        line_to(x, y) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'line_to', x, y ] }); },
        move_to(x, y) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'move_to', x, y ] }); },
        quadratic_curve_to(cpx, cpy, x, y) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'quadratic_curve_to', cpx, cpy, x, y ] }); },
        rect(x, y, w, h) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'rect', x, y, w, h ] }); },
        restore() { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'restore' ] }); },
        rotate(angle) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'rotate', angle ] }); },
        save() { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'save' ] }); },
        scale(x, y) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'scale', x, y ] }); },
        set_transform(a, b, c, d, e, f) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'set_transform', a, b, c, d, e, f ] }); },
        stroke() { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'stroke' ] }); },
        stroke_rect(x, y, w, h) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'stroke_rect', x, y, w, h ] }); },
        stroke_text(textptr, textlen, x, y, max_width) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'stroke_text', S(textptr, textlen), x, y, max_width > 0 ? max_width : null ] }); },
        transform(a, b, c, d, e, f) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'transform', a, b, c, d, e, f ] }); },
        translate(x, y) { self.postMessage({ type: 'canvas', data: [ canvas_order_id++, 'translate', x, y ] }); },

        mouse_position(outx, outy) {
            let data = new DataView(wasm_memory.buffer);
            let canvas_data = new Int32Array(canvas_data_buffer);

            data.setFloat32(outx, Atomics.load(canvas_data, 3), true);
            data.setFloat32(outy, Atomics.load(canvas_data, 4), true);
        },

        mouse_down() {
            let canvas_data = new Int32Array(canvas_data_buffer);
            if (Atomics.load(canvas_data, 6) > 0) {
                return 1;
            } else {
                return 0;
            }
        },

        mouse_get_click(outx, outy) {
            let data = new DataView(wasm_memory.buffer);
            let canvas_data = new Int32Array(canvas_data_buffer);

            self.postMessage({ type: "highlight_canvas", data: null });

            Atomics.wait(canvas_data, 5, 0);
            Atomics.store(canvas_data, 5, 0);

            data.setFloat32(outx, Atomics.load(canvas_data, 3), true);
            data.setFloat32(outy, Atomics.load(canvas_data, 4), true);
        }
    }
};

onmessage = function(m) {
    switch (m.data.type) {
        case 'set_buffers': {
            input_shared_buffer = m.data.input_buffer;
            canvas_data_buffer  = m.data.canvas_buffer;
            fs_shared_buffer    = m.data.fs_buffer;
            break;
        }

        case 'start': {
            WebAssembly.instantiate(m.data.data, import_obj)
            .then(response => {
                wasm_memory = response.instance.exports.memory;

                try {
                    response.instance.exports._start();
                } catch (e) {
                    self.postMessage({ type: 'errored', data: e.toString() });
                }

                self.postMessage({ type: 'canvas', data: [ 0, 'sync' ] });
                self.postMessage({ type: 'terminated' });
                self.close();
            });

            break;
        }

        case 'stop':
            self.postMessage({ type: 'canvas', data: [ 0, 'sync' ] });
            self.postMessage({ type: 'terminated' });
            self.close();
            break;
    }
};
