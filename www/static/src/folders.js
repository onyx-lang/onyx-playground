
// Experimental Folder System
class FolderSystem {
    constructor() {
        this.folders = [];
    }

    _getPathParts(path) {
        return path.split("/").filter(x => x != "");
    }

    create_directory(path) {
        if (path == "" || path == "/") {
            return { type:"dir", elems:this.folders }
        }

        let parts = this._getPathParts(path);
        let name = parts.at(-1);

        let root = this.folders;
        for (let part of parts.slice(0, parts.length - 1)) {
            let matches = root.filter((x) => x.name == part);
            if (matches.length == 0) {
                root.push({
                    name: part,
                    type: "dir",
                    state: "closed",
                    elems: [],
                });
                root = root[root.length - 1].elems;

            } else {
                root = matches[0].elems;
            }
        }

        for (let elem of root) {
            if (elem.name == name) return elem;
        }

        root.push({
            name,
            type: "dir",
            state: "closed",
            elems: [],
        })

        return root[root.length - 1];
    }

    get_containing_directory(path) {
        let last_slash = path.lastIndexOf("/");
        if (last_slash == -1) return "";

        return path.substring(0, last_slash);
    }

    create_file(path, contents) {
        let containing_dir = this.get_containing_directory(path);
        let dir = this.create_directory(containing_dir);

        let filename = path.substring(path.lastIndexOf("/") + 1);

        let existing = dir.elems.find(x => x == filename)
        if (existing) {
            return existing;
        }

        dir.elems.push({
            name: filename,
            type: "file",
            contents
        })

        return dir.elems[dir.elems.length - 1];
    }

    remove(path) {
        let containing_dir = this.get_containing_directory(path);
        let dir = this.create_directory(containing_dir);

        let filename = path.substring(path.lastIndexOf("/") + 1);
        dir.elems.splice(dir.elems.findIndex(x => x.name == filename), 1);
    }

    // Returns null if the item at the path does not exist
    lookup(path) {
        let parts = this._getPathParts(path);
        
        let root = { type:"dir", elems:this.folders };
        let i;
        for (i=0; i<parts.length; i++) {
            if (root.type == "dir") {
                let elems = root.elems.filter(x => x.name == parts[i]);
                if (elems.length != 1) {
                    root = null;
                    break;
                }

                root = elems[0];

            } else if (root.type == "file") {
                if (root.name != parts[i] || i != parts.length - 1) {
                    root = null;
                }

                break;
            }
        }

        return root;
    }

    move_file(old_path, new_path) {
        let existing = this.lookup(old_path);

        if (existing == null) return;

        if (existing.type == "file") {
            this.remove(old_path);
            this.create_file(new_path, existing.contents);
        } else {
            let dirname = new_path.substring(new_path.lastIndexOf("/") + 1);
            existing.name = dirname;
        }
    }

    build_folder_view(selector=".folder-root") {
        let $root = $(selector);

        let build = (t, name) => {
            let output = "";
            switch (t.type) {
                case "dir": {
                    t.elems.sort((a, b) => {
                        let av = a.type == "dir" ? 0 : 1;
                        let bv = b.type == "dir" ? 0 : 1;

                        if (av == bv) {
                            return a.name.localeCompare(b.name);
                        } else {
                            return av - bv;
                        }
                    })

                    if (name != undefined) {
                        output += `<div class="folder-item directory ${t.state}" data-filename="${name}">
                        <i class="fa ${t.state == "open" ? "fa-folder-open" : "fa-folder"}"></i>
                        ${t.name}
                        </div>`;

                        output += `<div class="folder ${t.state == "closed" ? "hidden" : ""}">`;
                        for (let i of t.elems) {
                            output += build(i, name + "/" + i.name);
                        }
                        output += `</div>`;
                    } else {
                        for (let i of t.elems) {
                            output += build(i, i.name);
                        }
                    }

                    break;
                }

                case "file": {
                    output += `<div class="folder-item file" data-filename="${name}">
                    <i class="fa fa-file"></i>
                    ${t.name}
                    </div>`;
                    break;
                }
            }

            return output;
        }

        let root = {type:"dir", elems:this.folders};
        let root_html = build(root);

        $root.html(root_html);
        // $root.find(".folder-item i.fa-pencil-alt").click(folder_start_rename);
        // $root.find(".folder-item i.fa-trash").click(folder_start_remove);
        // <i class="folder-item-button fa fa-trash"></i>
        // <i class="folder-item-button fa fa-pencil-alt"></i>
    }

    save() {
        localStorage["filesystem"] = JSON.stringify(this.folders);
    }

    restore() {
        if ("filesystem" in localStorage) {
            this.folders = JSON.parse(localStorage["filesystem"]);
            return true;
        }

        return false;
    }
}

async function enable_ide_mode() {
    $("#simple-menubar").addClass("hidden");
    // $("#ide-menubar").removeClass("hidden");
    $("#folder-view").removeClass("hidden");
    $("#main-horizontal-divider").removeClass("hidden");

    localStorage.setItem("folder-width", "25%");
    $(":root").css("--folder-width", localStorage.getItem("folder-width"));
    $(":root").css("--top-menu-bar-height", "0px");

    folders = new FolderSystem();
    folders.restore();
    folder_rebuild_view();

    editor.restoreTabState(path => {
        let file = folders.lookup(path);
        if (file) return file.contents;

        return "";
    });

    document.addEventListener("keydown", ctrlSHandler);
    
 
    // Enable :w for vim mode
    // This is such a freaking hack. I don't know how to properly wait for the module
    // to be ready, so my best attempt is to just wait for 1 second, then require the
    // module.
    setTimeout(() => {
        let ace_vim = require("ace/keyboard/vim");
        ace_vim.Vim.defineEx("write", 'w', folder_save_current_file)
    }, 1000);
}

function disable_ide_mode() {
    $("#simple-menubar").removeClass("hidden");
    $("#ide-menubar").addClass("hidden");
    $("#folder-view").addClass("hidden");
    $("#main-horizontal-divider").addClass("hidden");
    $(":root").css("--folder-width", "0px");
    $(":root").css("--top-menu-bar-height", "40px");

    document.removeEventListener("keydown", ctrlSHandler);

    editor.saveTabState();
}

function ctrlSHandler(e) {
    if (e.ctrlKey && e.key == 's') {
        folder_save_current_file();
        e.preventDefault();
        return false;
    }
}

async function populate_examples_folder() {
    let examples = await fetch(ROOT_ENDPOINT + "/list_examples").then(x => x.json())
    let example_dir = folders.create_directory("Examples");
    for (let ex of examples) {
        let example_code = await fetch(`${ROOT_ENDPOINT}/example?example=${ex}`).then(x => x.text());
        example_dir.elems.push({
            name: ex,
            type: "file",
            contents: example_code
        })
    }
}

async function populate_simple_saved_folder() {
    let folder_name = "Simple Mode Saves";

    let saved_dir = folders.create_directory(folder_name);
    for (let item in localStorage) {
        if (/saved_/.test(item)) {
            let item_name = item.substring(6);

            let existing_item = folders.lookup(folder_name + "/" + item_name);
            if (existing_item) {
                existing_item.contents = localStorage[item];

            } else {
                saved_dir.elems.push({
                    name: item_name,
                    type: "file",
                    contents: localStorage[item],
                });
            }
        }
    }
}

async function populate_core_libraries_folder() {
    let core_libs = await fetch(ROOT_ENDPOINT + "/core_libraries.json").then(x => x.json())
    let core_dir = folders.create_directory("Core Libraries");
    core_dir.elems = core_libs;
}

function folder_rebuild_view() {
    folders.build_folder_view();

    $(".folder-root").on("contextmenu", folder_context_menu(`
        <div onclick="folder_context_menu_close(); folder_start_create('file', event)">
            <i class="fa fa-plus"></i>
            New File
        </div>
        <div onclick="folder_context_menu_close(); folder_start_create('directory', event)">
            <i class="fa fa-plus"></i>
            New Folder
        </div>
    `));

    $(".folder-item").on("click", folder_item_click);

    $(".folder-item.file").on("contextmenu", folder_context_menu(`
        <div onclick="folder_context_menu_close(); folder_start_rename(event)">
            <i class="fa fa-pencil"></i>
            Rename
        </div>
        <div>
            <i class="fa fa-folder"></i>
            Move
        </div>
        <div onclick="folder_context_menu_close(); folder_duplicate(event)">
            <i class="fa fa-copy"></i>
            Duplicate
        </div>
        <div onclick="folder_context_menu_close(); folder_start_remove(event)">
            <i class="fa fa-trash"></i>
            Delete
        </div>
    `, ($cm, e) => $cm.attr("data-filename", $(e.target).data("filename"))));

    $(".folder-item.directory").on("contextmenu", folder_context_menu(`
        <div onclick="folder_context_menu_close(); folder_start_rename(event)">
            <i class="fa fa-pencil"></i>
            Rename
        </div>
        <div onclick="folder_context_menu_close(); folder_start_create('file', event)">
            <i class="fa fa-plus"></i>
            New File
        </div>
        <div onclick="folder_context_menu_close(); folder_start_create('directory', event)">
            <i class="fa fa-plus"></i>
            New Folder
        </div>
        <div onclick="folder_context_menu_close(); folder_start_remove(event)">
            <i class="fa fa-trash"></i>
            Delete
        </div>
    `, ($cm, e) => $cm.attr("data-filename", $(e.target).data("filename"))));
}

function folder_context_menu(menu_contents, attachData) {
    return e => {
        let $cm = $("#context-menu");
        $cm.css("left", e.clientX + "px");
        $cm.css("top", e.clientY + "px");
        $cm.removeClass("hidden");

        $cm.html(menu_contents);

        $(document.body).append(`
            <div id="context-menu-closer" style="position: fixed; z-index: 9999; top: 0; right: 0; left: 0; bottom: 0;"></div>
        `);

        $("#context-menu-closer")
            .on("click", folder_context_menu_close)
            .on("contextmenu", () => false);

        if (attachData) attachData($cm, e);

        return false;
    }
}

function folder_context_menu_close() {
    $("#context-menu-closer").remove();
    $("#context-menu").addClass("hidden");
}

function folder_item_click(e) {
    let $target = $(e.target);

    if ($target.hasClass("file")) {
        let filename = $target.attr("data-filename");
        folder_open_file(filename);
    }

    if ($target.hasClass("directory")) {
        let dirname = $target.attr("data-filename");
        let dir = folders.lookup(dirname);

        if ($target.hasClass("open")) {
            $target.removeClass("open").addClass("closed");
            $target.children("i").removeClass("fa-folder-open").addClass("fa-folder");
            $target.next().addClass("hidden");
            dir.state = "closed";
        } else {
            $target.removeClass("closed").addClass("open");
            $target.children("i").removeClass("fa-folder").addClass("fa-folder-open");
            $target.next().removeClass("hidden");
            dir.state = "open";
        }
    }
}

function folder_open_file(filename) {
    let file = folders.lookup(filename);
    editor.openOrSwitchToTab(filename, file.name, () => file.contents);
}

function folder_start_create(type, event) {
    let $modal = null;

    if (type == 'file') {
        $modal = $("#create-file-modal");
    }

    if (type == 'directory') {
        $modal = $("#create-dir-modal");
    }

    if (!$modal) return;

    $modal.find("input").val("");
    $modal.find(".create-base-path").html("/" + (event.target.parentNode.getAttribute("data-filename") ?? ""));
    $modal.modal();
}

function folder_finalize_create(type) {
    if (type == 'file') {
        let $modal = $("#create-file-modal");
        let name = $modal.find("input").val();
        let path = $modal.find(".create-base-path").text();
        let fullpath = path + "/" + name;

        folders.create_file(fullpath, "");
        folders.save();
        folder_rebuild_view();

        folder_open_file(fullpath);
    }

    if (type == 'directory') {
        let $modal = $("#create-dir-modal");
        let name = $modal.find("input").val();
        let path = $modal.find(".create-base-path").text();
        let fullpath = path + "/" + name;

        folders.create_directory(fullpath);
        folders.save();
        folder_rebuild_view();
    }

    $.modal.close();
}

function folder_start_rename(e) {
    let filename = $(e.target).parent().attr("data-filename");
    let $modal = $("#rename-modal");
    $modal.find("input").val(filename);
    $modal.attr("data-filename", filename);
    $modal.modal();
}

function folder_finalize_rename(e) {
    let $modal = $("#rename-modal");
    let current_filename = $modal.attr("data-filename");
    let new_filename = $modal.find("input").val();
    $.modal.close();

    folders.move_file(current_filename, new_filename);
    folders.save();
    folder_rebuild_view();

    folder_open_file(new_filename);
}

function folder_start_remove(e) {
    let filename = $(e.target).parent().attr("data-filename");
    let $modal = $("#remove-modal");
    $modal.find("p").html(`Are you sure you want to remove ${filename}?`);
    $modal.attr("data-filename", filename);
    $modal.modal();
}

function folder_finalize_remove() {
    let $modal = $("#remove-modal");
    let filename = $modal.attr("data-filename");

    folders.remove(filename);
    folders.save();
    folder_rebuild_view();

    $.modal.close();
}

function folder_duplicate(e) {
    let filename = $(e.target).parent().attr("data-filename");
    folders.create_file(filename + " copy", folders.lookup(filename)?.contents ?? "");
    folders.save();
    folder_rebuild_view();
}

async function folder_handle_drop(e) {
    e.preventDefault();
    if (e.dataTransfer.items.length == 0) return;

    let parent;
    if (e.target.classList.contains("directory")) {
        parent = e.target.getAttribute("data-filename") ?? "/";
    } else {
        parent = e.target.closest(".folder")?.previousSibling?.getAttribute("data-filename") ?? "/";
    }

    let file = await e.dataTransfer.items[0].getAsFile();
    folders.create_file(parent + "/" + file.name, await file.text());
    folders.save();
    folder_rebuild_view();

    return false;
}

function folder_save_current_file() {
    let filepath = editor.getActiveFilePath();
    if (filepath == "") return;

    let file = folders.lookup(filepath);
    if (file == null) return;

    editor.saveTab(filepath, (contents) => {
        file.contents = contents;
        return true;
    });
    folders.save();
}

function folder_save_all_files() {
    editor.saveAllTabs((filename, contents) => {
        let file = folders.lookup(filename);
        if (file != null) {
            file.contents = contents;
            return true;
        }
    });

    folders.save();
}

function folder_run() {
    folder_save_all_files();
    submit_code();
}