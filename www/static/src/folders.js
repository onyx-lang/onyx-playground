
// Experimental Folder System
class FolderSystem {
    constructor() {
        this.folders = [];
        this.active_file_path = "";
    }

    create_directory(path) {
        if (path == "") {
            return { type:"dir", elems:this.folders }
        }

        let parts = path.split("/");
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
        let parts = path.split("/");
        
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

    build_folder_view(onclick, selector=".folder-root") {
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
                        <i class="folder-item-button fa fa-trash"></i>
                        <i class="folder-item-button fa fa-pencil-alt"></i>
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
                    <i class="folder-item-button fa fa-trash"></i>
                    <i class="folder-item-button fa fa-pencil-alt"></i>
                    </div>`;
                    break;
                }
            }

            return output;
        }

        let root = {type:"dir", elems:this.folders};
        let root_html = build(root);

        $root.html(root_html);
        $root.find(".folder-item").click(onclick);
        $root.find(".folder-item i.fa-pencil-alt").click(folder_start_rename);
        $root.find(".folder-item i.fa-trash").click(folder_start_remove);
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

    if (folders.lookup("Examples") == null) {
        await populate_examples_folder();
    }

    if (folders.lookup("Core Libraries") == null) {
        await populate_core_libraries_folder();
    }

    await populate_simple_saved_folder();

    folders.save();
    folders.build_folder_view(folder_item_click);
 
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
    let editor = ace.edit("code-editor");
    if (folders.active_file_path != "") {
        let file = folders.lookup(folders.active_file_path);
        if (file != null) {
            file.contents = editor.getValue();
            folders.save();
        }
    }

    let file = folders.lookup(filename);
    editor.setValue(file.contents);
    editor.clearSelection();
    folders.active_file_path = filename;
}

function folder_start_create_file() {
    let $modal = $("#create-file-modal");
    $modal.find("input").val("");
    $modal.modal();
}

function folder_finalize_create_file() {
    let $modal = $("#create-file-modal");
    let path = $modal.find("input").val();

    folders.create_file(path, "");
    folders.save();
    folders.build_folder_view(folder_item_click);

    folder_open_file(path);

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
    folders.build_folder_view(folder_item_click);

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
    folders.build_folder_view(folder_item_click);

    $.modal.close();
}

function folder_save_current_file() {
    let editor = ace.edit("code-editor");
    if (folders.active_file_path != "") {
        let file = folders.lookup(folders.active_file_path);
        if (file != null) {
            file.contents = editor.getValue();
            folders.save();
        }
    }
}
