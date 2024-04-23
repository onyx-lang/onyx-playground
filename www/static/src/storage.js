function refresh_file_lists(callback) {
    $(".file-list").empty();

    let filenames = [];
    let $lists = $(".file-list");
    for (let i=0; i < localStorage.length; i++) {
        let name = localStorage.key(i);
        if (name.startsWith("saved_")) {
            let filename = name.substr(6);
            filenames.push(filename);
        }
    }

    filenames.sort();

    for (let filename of filenames) {
        let $button = $(`<button class='file-select'>${filename}</button>`);
        $button.on('click', (ev) => callback(filename));

        let $delete_button = $(`<button class='file-delete'><i class='fas fa-trash'></i></button>`);
        $delete_button.on('click', (ev) => delete_from_local_storage_with_name(filename, callback));

        $lists.append($button);
        $lists.append($delete_button);
    }
}

function prompt_save() {
    refresh_file_lists(save_to_local_storage_with_name);
    $("#save-modal").modal();
}

function save_to_local_storage() {
    let filename = $("#save-filename").val();
    save_to_local_storage_with_name(filename);
    $("#save-filename").val("");
}

function save_to_local_storage_with_name(filename) {
    let code = editor.getText();

    localStorage["saved_" + filename] = code;

    $.modal.close();
}

function prompt_load() {
    refresh_file_lists(load_from_local_storage_with_name);
    $("#load-modal").modal();
}

function load_from_local_storage() {
    let filename = $("#load-filename").val();
    load_from_local_storage_with_name(filename);
    $("#load-filename").val("");
}

function load_from_local_storage_with_name(filename) {
    let code = editor.getText();

    let maybe_code = localStorage.getItem("saved_" + filename);
    if (maybe_code != null) {
        editor.setValue(maybe_code);
        editor.clearSelection();
    }

    $.modal.close();
}

function delete_from_local_storage_with_name(filename, cb) {
    localStorage.removeItem(`saved_${filename}`);
    refresh_file_lists(cb);
}

function quick_save() {
    let code = editor.getText();

    localStorage.setItem("quicksave", code);
}

function quick_load() {
    let maybe_code = localStorage.getItem("quicksave");
    if (maybe_code != null) {
        editor.setText(maybe_code);
        editor.clearSelection();
    } else {
        editor.setText(`use core {*}

main :: () {
    println("Hello, Onyx!")
}`);
        editor.clearSelection();
    }
}

function prompt_download() {
    let code = editor.getText();

    let blob = new Blob([ code ], {
        type: 'text/plain'
    });

    let download_link = document.createElement('a');
    download_link.download = `onyx-${Date.now()}.onyx`;
    download_link.href = window.URL.createObjectURL(blob);
    download_link.onclick = function(e) {
        // revokeObjectURL needs a delay to work properly
        setTimeout(() => {
            window.URL.revokeObjectURL(this.href);
        }, 1500);
    };

    download_link.click();
    download_link.remove();
}

function prompt_upload() {
    $("#fileupload").click();
}

function file_uploaded(ev) {
    let file = ev.target.files[0];

    let reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = readerEvent => {
        let code = readerEvent.target.result;
        editor.setText(code);
        editor.clearSelection();
    }
}
