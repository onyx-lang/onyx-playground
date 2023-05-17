let wasm_worker = null;
let editor_keybind_mode = "normal";
let editor_theme = "chrome";
let ui_theme = "dark";
let ui_mode = "simple";

let input_shared_buffer  = new SharedArrayBuffer(1024 * Uint8Array.BYTES_PER_ELEMENT);
let canvas_shared_buffer = new SharedArrayBuffer(7 * Int32Array.BYTES_PER_ELEMENT);
let folders = null;

async function clear_output() {
    let elem = document.getElementById('code-result');
    elem.className = "";   // NOTE: This clears all the classes, not just the "errored" one!
    elem.innerHTML = "";
}

async function write_output(msg, has_error) {
    let elem = document.getElementById('code-result');
    if (has_error != null && has_error) elem.className = "errored";
    elem.innerHTML += msg;

    elem.scrollTop = elem.scrollHeight - elem.clientHeight;
}

async function run_wasm(wasm_bytes) {
    if (wasm_worker != null) {
        wasm_worker.terminate();
        wasm_worker = null;
    }
    update_running_msg();

    input_shared_buffer = new SharedArrayBuffer(1024 * Uint8Array.BYTES_PER_ELEMENT);
    wasm_worker = new Worker(window.ROOT_ENDPOINT + '/static/src/worker.js');

    wasm_worker.onmessage = (e) => {
        switch (e.data.type) {
            case 'print_str': {
                write_output(e.data.data);
                break;
            }
            
            case 'errored': {
                write_output(e.data.data, true);
                break;
            }

            case 'terminated': {
                wasm_worker.terminate();

                wasm_worker = null;
                update_running_msg();
                break;
            }

            case 'canvas': {
                canvas_handler(e.data.data);
            }
        }
    };

    wasm_worker.postMessage({
        type: 'set_buffers',
        input_buffer:  input_shared_buffer,
        canvas_buffer: canvas_shared_buffer,
    });
    wasm_worker.postMessage({ type: 'start', data: wasm_bytes });
    update_running_msg();
}

async function submit_code() {
    if (wasm_worker != null) return;

    clear_output();
    let editor = ace.edit('code-editor');
    let code = editor.getValue();

    let response = await fetch(window.ROOT_ENDPOINT + "/compile", {
        method: 'POST',
        cache:  'no-cache',
        headers: {
            'Content-Type': 'application/json',
        },
        body:   JSON.stringify({ code }),
    });

    if (response.status == 200) {
        // Successful compile
        // Clear errors in the gutter first
        editor.getSession().setAnnotations([]);

        run_wasm(await response.arrayBuffer());

    } else {
        // Compile error
        let response_text = await response.text();
        
        write_output("Failed to compile code\n", true);
        write_output(response_text, true);

        // Add the errors as gutter items in ACE
        let annotations = [];
        let lines = response_text.split("\n");
        for (let line of lines) {
            let e = /\(\/tmp\/[^:]+:(\d+),(\d+)\) (.*)/.exec(line);
            if (e != null) {
                annotations.push({
                    row: parseInt(e[1]) - 1,
                    column: parseInt(e[2]),
                    text: e[3],
                    type: "error",
                });
            }
        }

        editor.getSession().setAnnotations(annotations);
    }
}

async function kill_code() {
    if (wasm_worker != null) {
        wasm_worker.terminate();
        wasm_worker = null;
    }

    update_running_msg();
}

function update_running_msg() {
    let elem = $('.run-button');
    if (wasm_worker == null) {
        elem.html("<i class='fas fa-play'></i>");

    } else {
        elem.html("<i class='fas fa-circle-notch fa-spin'></i>");
    }
}

function change_editor_theme(value) {
    let editor = ace.edit('code-editor');
    let elem = document.getElementById('code-editor-theme');

    if (value == null) {
        value = elem.value;
    } else {
        document.querySelector(`#code-editor-theme option[value="${value}"]`).selected = true;
    }

    editor.setTheme(`ace/theme/${value}`);

    editor_theme = value;
    persist_settings();
}

function change_keybindings(value) {
    let editor = ace.edit('code-editor');
    let elem = document.getElementById('code-editor-keybindings');

    if (value == null) {
        value = elem.value;
    } else {
        document.querySelector(`#code-editor-keybindings option[value="${value}"]`).selected = true;
    }

    if (value == "normal") editor.setKeyboardHandler("");
    else                   editor.setKeyboardHandler(`ace/keyboard/${value}`);

    editor_keybind_mode = value;
    persist_settings();
}

function change_ui_theme(value) {
    let elem = document.getElementById('ui-theme');

    if (value == null) {
        value = elem.value;
    } else {
        document.querySelector(`#ui-theme option[value="${value}"]`).selected = true;
    }

    $("body").removeClass();
    if (value == "light") $("body").addClass("ui-light-theme");
    if (value == "blue")  $("body").addClass("ui-blue-theme");
    if (value == "dark")  $("body").addClass("ui-dark-theme");

    $("meta[name='theme-color']").attr("content", $("body").css("background-color"))

    ui_theme = value;
    persist_settings();
}

function change_ui_mode(value) {
    let elem = document.getElementById('ui-mode');
    if (value == null) {
        value = elem.value;
    } else {
        document.querySelector(`#ui-mode option[value="${value}"]`).selected = true;
    }

    if (value == "ide") {
        enable_ide_mode();
    } else {
        disable_ide_mode();
    }

    ui_mode = value;
    persist_settings();
}

function persist_settings() {
    localStorage["editor_theme"] = editor_theme;
    localStorage["editor_keybind_mode"] = editor_keybind_mode;
    localStorage["ui_theme"] = ui_theme;
    localStorage["ui_mode"] = ui_mode;
}

function load_settings() {
    editor_theme = localStorage["editor_theme"];
    editor_keybind_mode = localStorage["editor_keybind_mode"];
    ui_theme = localStorage["ui_theme"] || ui_theme;
    ui_mode = localStorage["ui_mode"] || ui_mode;

    load_split_sizes();
    change_editor_theme(editor_theme);
    change_keybindings(editor_keybind_mode);
    change_ui_theme(ui_theme);
    change_ui_mode(ui_mode);
}

async function handle_drop(e) {
    e.preventDefault();

    let editor = ace.edit('code-editor');
    editor.setValue(await e.dataTransfer.items[0].getAsFile().text(), 0);

    return false;
}

function handle_dragover(e) {
    e.preventDefault();
    return false;
}

function submit_input() {
    let inputbar = document.getElementById("input-bar");
    let input = inputbar.value;

    write_output(input + "\n", false);

    let input_array = new Uint8Array(input_shared_buffer, 4);
    input_array.fill(0);

    for (let i=0; i<input.length && i<input_array.length - 1; i++) {
        input_array[i] = input.charCodeAt(i);
    }

    let atomic_array = new Int32Array(input_shared_buffer);
    Atomics.store(atomic_array, 0, 1);
    Atomics.notify(atomic_array, 0);
    inputbar.value = "";
}

function populate_examples() {
    fetch(ROOT_ENDPOINT + "/list_examples")
    .then(x => x.json())
    .then(examples => {
        let $selector = $("#examples-selector");

        for (let ex of examples) {
            $selector.append($('<option>', {
                value: ex,
                text:  ex,
            }));
        }
    });
}

function load_example() {
    let $selector = $("#examples-selector");
    let example = $selector.val();
    if (example == "---") return;

    fetch(`${ROOT_ENDPOINT}/example?example=${example}`)
    .then(x => x.text())
    .then(text => {
        let editor = ace.edit('code-editor');
        editor.setValue(text, 0);
    });
}

async function request_permalink() {
    let editor = ace.edit('code-editor');
    let code = editor.getValue();

    let response = await fetch(window.ROOT_ENDPOINT + "/permalink", {
        method: 'POST',
        cache:  'no-cache',
        headers: {
            'Content-Type': 'application/json',
        },
        body:   JSON.stringify({ code }),
    });

    if (response.status == 200) {
        let res = await response.json();
        console.log(res);
        $("#permalink").html(`Permalink created: <a target="_blank" href="${res.url}">${res.url}</a>`);
        $("#permalink + button").prop("disabled", "true");
    }
}

function load_split_sizes() {
    let $root = $(":root");

    $root.css("--top-half-height", localStorage.getItem("top-half-height"));
    $root.css("--left-half-width", localStorage.getItem("left-half-width"));
    $root.css("--folder-width", "0px");
}

function save_split_sizes() {
    let $root = $(":root");

    localStorage.setItem("top-half-height", $root.css("--top-half-height"));
    localStorage.setItem("left-half-width", $root.css("--left-half-width"));
}

window.onload = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(window.ROOT_ENDPOINT + "/static/src/service-worker.js", {
            scope: window.ROOT_ENDPOINT
        });
    }

    let editor = ace.edit('code-editor');

    editor.setTheme('ace/theme/chrome');
    editor.setShowPrintMargin(false);
    editor.setFontSize(16);
    editor.session.setMode('ace/mode/onyx');

    populate_examples();
    load_settings();

    make_resizer("main-horizontal-divider", "--folder-width", "", (e) => {
        save_split_sizes();
    });

    make_resizer("code-horizontal-divider", "--left-half-width", "", (e) => {
        editor.resize(true);
        save_split_sizes();
    });

    make_resizer("vertical-divider", "", "--top-half-height", (e) => {
        save_split_sizes();
    });

    document.getElementById("input-bar").addEventListener("keyup", (ev) => {
        if (ev.keyCode === 13) {
            submit_input();
        }
    });

    $("#save-filename").on('keyup', (ev) => { if (ev.keyCode === 13) save_to_local_storage() });
    $("#load-filename").on('keyup', (ev) => { if (ev.keyCode === 13) load_from_local_storage() });
};