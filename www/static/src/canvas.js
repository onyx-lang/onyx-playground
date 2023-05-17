let canvas_element = "";
let ctx = null;
let canvas_op_buffer = [];

let canvas_handlers_registered = false;
function canvas_register_handlers() {
    if (canvas_handlers_registered) return;

    canvas_element.addEventListener("mousemove", (e) => {
        let canvas_data = new Int32Array(canvas_shared_buffer);
        let box = canvas_element.getBoundingClientRect();
        let mx = (e.clientX - box.left) * box.width / canvas_element.width;
        let my = (e.clientY - box.top) * box.height / canvas_element.height;

        Atomics.store(canvas_data, 3, mx);
        Atomics.store(canvas_data, 4, my);
    });

    canvas_element.addEventListener("mousedown", (e) => {
        let canvas_data = new Int32Array(canvas_shared_buffer);
        Atomics.store(canvas_data, 6, 1);
    });

    canvas_element.addEventListener("mouseup", (e) => {
        let canvas_data = new Int32Array(canvas_shared_buffer);
        Atomics.store(canvas_data, 6, 0);
    });

    canvas_element.addEventListener("click", (e) => {
        let canvas_data = new Int32Array(canvas_shared_buffer);
        let box = canvas_element.getBoundingClientRect();
        let mx = (e.clientX - box.left) * box.width / canvas_element.width;
        let my = (e.clientY - box.top) * box.height / canvas_element.height;

        Atomics.store(canvas_data, 3, mx);
        Atomics.store(canvas_data, 4, my);
        Atomics.store(canvas_data, 5, 1);
        Atomics.notify(canvas_data, 5);
    });

    canvas_handlers_registered = true;
}

function update_canvas_data() {
    let canvas_data = new Int32Array(canvas_shared_buffer);
    let box = canvas_element.getBoundingClientRect();

    canvas_element.width  = box.width;
    canvas_element.height = box.height;

    canvas_op_buffer = [];

    Atomics.store(canvas_data, 0, box.width);
    Atomics.store(canvas_data, 1, box.height);
    Atomics.store(canvas_data, 2, 1);
    Atomics.notify(canvas_data, 2);
}

function canvas_buffer_flush() {
    // canvas_op_buffer.sort((a, b) => a[0] - b[0]);

    for (let op of canvas_op_buffer) {
        canvas_process(op);
    }

    canvas_op_buffer = [];
}

function canvas_handler(instr) {
    if (instr[1] == 'sync' || instr[1] == 'init') {
        canvas_process(instr);
    } else {
        canvas_op_buffer.push(instr);
    }
}

function canvas_process(instr) {
    switch (instr[1]) {
        case 'init': {
            canvas_element = document.getElementById("render-target");
            ctx = canvas_element.getContext('2d');
            update_canvas_data();
            canvas_register_handlers();
            break;
        }

        case 'sync': {
            window.requestAnimationFrame(() => {
                canvas_buffer_flush();
                let canvas_data = new Int32Array(canvas_shared_buffer);
                Atomics.store(canvas_data, 2, 1);
                Atomics.notify(canvas_data, 2);
            });
            break;
        }

        case 'fill_style': ctx.fillStyle = instr[2]; break;
        case 'font': ctx.font = instr[2]; break;
        case 'image_smoothing_enabled': ctx.imageSmoothingEnabled = instr[2]; break;
        case 'line_join': ctx.lineJoin = instr[2]; break;
        case 'line_width': ctx.lineWidth = instr[2]; break;
        case 'stroke_style': ctx.strokeStyle = instr[2]; break;
        case 'text_align': ctx.textAlign = instr[2]; break;

        case 'arc': ctx.arc(instr[2], instr[3], instr[4], instr[5], instr[6], instr[7]); break;
        case 'arc_to': ctx.arcTo(instr[2], instr[3], instr[4], instr[5], instr[6]); break;
        case 'begin_path': ctx.beginPath(); break;
        case 'clear': ctx.clearRect(0, 0, canvas_element.width, canvas_element.height); break;
        case 'clear_rect': ctx.clearRect(instr[2], instr[3], instr[4], instr[5]); break;
        case 'clip': ctx.clip(instr[2]); break;
        case 'close_path': ctx.closePath(); break;
        case 'ellipse': ctx.ellipse(instr[2], instr[3], instr[4], instr[5], instr[6], instr[7], instr[8], instr[9]); break;
        case 'fill': ctx.fill(instr[2]); break;
        case 'fill_rect': ctx.fillRect(instr[2], instr[3], instr[4], instr[5]); break;
        case 'fill_text': ctx.fillText(instr[2], instr[3], instr[4], instr[5]); break;
        case 'line_to': ctx.lineTo(instr[2], instr[3]); break;
        case 'move_to': ctx.moveTo(instr[2], instr[3]); break;
        case 'quadratic_curve_to': ctx.quadraticCurveTo(instr[2], instr[3], instr[4], instr[5]); break;
        case 'rect': ctx.rect(instr[2], instr[3], instr[4], instr[5]); break;
        case 'rotate': ctx.rotate(instr[2]); break;
        case 'save': ctx.save(); break;
        case 'scale': ctx.scale(instr[2], instr[3]); break;
        case 'set_transform': ctx.setTransform(instr[2], instr[3], instr[4], instr[5], instr[6], instr[7]); break;
        case 'stroke': ctx.stroke(); break;
        case 'stroke_rect': ctx.strokeRect(instr[2], instr[3], instr[4], instr[5]); break;
        case 'stroke_text': ctx.strokeText(instr[2], instr[3], instr[4], instr[5]); break;
        case 'transform': ctx.transform(instr[2], instr[3], instr[4], instr[5], instr[6], instr[7]); break;
        case 'translate': ctx.translate(instr[2], instr[3]); break;
    }
}
