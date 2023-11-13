
// Experimental Folder System
class FolderSystem {
    constructor() {
        this.folders = [];

        this.currentProject = "";
        this.compilationTarget = "";
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
        let index = dir.elems.findIndex(x => x.name == filename);
        if (index >= 0) {
            dir.elems.splice(index, 1);
            return true;
        } else {
            return false;
        }
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

        if (existing == null) return false;

        editor.closeTabByPath(old_path);
        this.remove(old_path);

        if (existing.type == "file") {
            this.create_file(new_path, existing.contents);
        } else {
            let newdir = this.create_directory(new_path);
            newdir.elems = existing.elems;
        }

        return true;
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
                        output += `<div class="folder-item directory ${t.state}" data-filename="${name}" draggable="true">
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
                    output += `<div class="folder-item file" data-filename="${name}" draggable="true">
                    <i class="fa fa-file"></i>
                    ${t.name}
                    ${name == this.compilationTarget ? "<i class='fa fa-bullseye'></i>" : ""}
                    </div>`;
                    break;
                }
            }

            return output;
        }

        let root = {type:"dir", elems:this.folders};
        let root_html = build(root);

        root_html = `
            <div class="folder-project-name">${this.currentProject}</div>
        ` + root_html;

        $root.html(root_html);

        $(".folder-item").on("dragstart", folder_start_drag);
        $(".folder-item").on("dragover", folder_start_drag_hover);
        $(".folder-item").on("dragleave", folder_stop_drag_hover);
        $(".folder-item").on("drop", folder_stop_drag);
    }

    createRestorePointString() {
        return JSON.stringify({
            name: this.currentProject,
            editor: editor.getTabState(),
            compilationTarget: this.compilationTarget,
            files: this.folders
        });
    }

    restoreFromString(project_string) {
        let project = JSON.parse(project_string);
        this.folders = project.files;
        this.compilationTarget = project.compilationTarget;
        this.currentProject = project.name;
        editor.setTabState(project.editor, _get_contents_for_file);
    }

    save(project_name) {
        localStorage["filesystem"] = JSON.stringify(this.folders);

        let project = this.createRestorePointString();
        if (project_name) {
            localStorage["project_" + project_name] = project;
        }

        if (this.currentProject) {
            localStorage["project_" + this.currentProject] = project;
        }
    }

    restore(project_name) {
        if (!project_name && "filesystem" in localStorage) {
            this.folders = JSON.parse(localStorage["filesystem"]);
            return true;
        }

        if (`project_${project_name}` in localStorage) {
            this.restoreFromString(localStorage[`project_${project_name}`]);
            return true;
        }

        this.folders = [];
        editor.setTabState([], _get_contents_for_file);
        return false;
    }

    switchProject(project_name) {
        if (this.currentProject) {
            this.save(this.currentProject);
        }

        this.currentProject = project_name;
        if (this.currentProject) {
            this.restore(this.currentProject);
        }

        localStorage["recent_project"] = project_name;
    }

    openRecentProject() {
        this.switchProject(localStorage["recent_project"] ?? "");
    }
    
    deleteProject(project_name) {
        localStorage.removeItem(`project_${project_name}`);

        if (project_name == this.currentProject) {
            // TODO Handle the case where you are deleting the current project...
        }
    }
}

function enable_ide_mode() {
    $(":root").css("--folder-width", localStorage.getItem("folder-width") ?? "25%");

    folders = new FolderSystem();
    folders.openRecentProject();
    folder_rebuild_view();

    document.addEventListener("keydown", ctrlSHandler);

    ace.edit('code-editor').commands.addCommand({
        name: 'Run code',
        bindKey: {
            win: 'Ctrl-R',
            mac: 'Command-R'
        },
        exec: () => folder_run(),
        readOnly: true // false if this command should not apply in readOnly mode
    });
 
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

    folders.save();
}

function ctrlSHandler(e) {
    if (e.ctrlKey && e.key == 's') {
        folder_save_current_file();
        e.preventDefault();
        return false;
    }

    if (e.ctrlKey && e.key == 'r') {
        folder_run();
        e.preventDefault();
        return false;
    }
}

function _get_contents_for_file(path) {
    let file = folders.lookup(path);
    if (file) return file.contents;

    return "";
}

function folder_rebuild_view() {
    folders.build_folder_view();

    $(".folder-root").on("contextmenu", folder_context_menu(`
        <div onclick="folder_context_menu_close(); folder_start_create('file', event)">
            <i class="fa fa-plus"></i>
            New File
        </div>
        <div onclick="folder_context_menu_close(); folder_start_create('directory', event)">
            <i class="fa fa-folder-plus"></i>
            New Folder
        </div>
    `, ($cm, e) => $cm.attr("data-filename", "")));

    $(".folder-item").on("click", folder_item_click);

    $(".folder-item.file").on("contextmenu", folder_context_menu(`
        <div onclick="folder_context_menu_close(); folder_set_compilation_target(event)">
            <i class="fa fa-bullseye"></i>
            Set as compilation target
        </div>
        <div onclick="folder_context_menu_close(); folder_start_rename(event)">
            <i class="fa fa-pencil"></i>
            Rename
        </div>
        <div onclick="folder_context_menu_close(); folder_duplicate(event)">
            <i class="fa fa-copy"></i>
            Duplicate
        </div>
        <div onclick="folder_context_menu_close(); folder_prompt_download(event)">
            <i class="fa fa-download"></i>
            Download
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
            <i class="fa fa-folder-plus"></i>
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

        if ($("#context-menu-closer")[0] == null) {
            $(document.body).append(`
                <div id="context-menu-closer" style="position: fixed; z-index: 9999; top: 0; right: 0; left: 0; bottom: 0;"></div>
            `);
        }

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

    $modal.find("input").val("").focus();
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
    $modal.find("input").val(filename).focus();
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

    editor.closeTabByPath(filename);

    folders.remove(filename);
    folders.save();
    folder_rebuild_view();

    $.modal.close();
}

function folder_open_project_modal() {
    $(".project-list").empty();

    let projects = [];
    let $list = $(".project-list");
    for (let i=0; i < localStorage.length; i++) {
        let name = localStorage.key(i);
        if (name.startsWith("project_")) {
            let project_name = name.substring(8);
            projects.push(project_name);
        }
    }

    if (projects.length == 0) {
        $list.append(`<div style="font-size: 0.8rem; width: 100%; text-align: center;">No projects found</div>`);

    } else {
        projects.sort();
        projects.forEach(project => {
            let $container = $(`<div class="list-container"></div>`);

            let $button = $(`<button class='select'>${project}</button>`);
            $button.on('click', ev => {
                folders.switchProject(ev.target.textContent);
                folder_rebuild_view();
                $.modal.close();
            });

            let $download_button = $(`<button class='download'><i class='fas fa-download'></i></button>`);
            $download_button.on('click', ev => {
                if (!ev.target.previousElementSibling) return;

                let name = ev.target.previousElementSibling.textContent;
                // Kind of a hack, but it works
                let tmp_folders = new FolderSystem();
                tmp_folders.switchProject(name);
                _download_file(`${name}.json`, tmp_folders.createRestorePointString());
            });

            let $delete_button = $(`<button class='delete'><i class='fas fa-trash'></i></button>`);
            $delete_button.on('click', ev => {
                if (confirm("Are you sure you want to delete this project?")) {
                    folders.deleteProject(
                        ev.target.previousElementSibling.previousElementSibling.textContent
                    );

                    ev.target.parentNode.remove();
                }
            });

            $container.append($button);
            $container.append($download_button);
            $container.append($delete_button);
            $list.append($container);
        });
    }

    $("#project-modal").modal();
}

function folder_create_project() {
    let name = $("#project-name").val();
    if (name == "") return;
    $("#project-name").empty();

    $.modal.close();

    folders.switchProject(name);
    folders.save(name);
    folder_rebuild_view();
}

function folder_duplicate(e) {
    let filename = $(e.target).parent().attr("data-filename");
    folders.create_file(filename + " copy", folders.lookup(filename)?.contents ?? "");
    folders.save();
    folder_rebuild_view();
}

async function folder_handle_drop(e) {
    e.preventDefault();
    if (e.dataTransfer.items.length == 0) {
        return folder_stop_drag(e);
    }

    let parent;
    if (e.target.classList.contains("directory")) {
        parent = e.target.getAttribute("data-filename") ?? "/";
    } else {
        parent = e.target.closest(".folder")?.previousElementSibling?.getAttribute("data-filename") ?? "/";
    }

    let file = await e.dataTransfer.items[0].getAsFile();
    folders.create_file(parent + "/" + file.name, await file.text());
    folders.save();
    folder_rebuild_view();

    return false;
}

function folder_prompt_download(e) {
    let filename = $(e.target).parent().attr("data-filename");
    let file = folders.lookup(filename);
    if (file == null) return;

    _download_file(file.name, file.contents);
}

function _download_file(name, contents) {
    let blob = new Blob([ contents ], {
        type: 'text/plain'
    });

    let download_link = document.createElement('a');
    download_link.download = name;
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

function folder_project_start_upload() {
    $("#projectupload").click();
}

function folder_project_uploaded(ev) {
    let file = ev.target.files[0];

    let reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = readerEvent => {
        let contents = readerEvent.target.result;
        let tmp_folders = new FolderSystem();
        tmp_folders.restoreFromString(contents);
        tmp_folders.save();

        folders.switchProject(tmp_folders.currentProject);
        folder_rebuild_view();
        $.modal.close();
    }
}

function folder_set_compilation_target(e) {
    let filename = $(e.target).parent().attr("data-filename");
    folders.compilationTarget = filename;
    folders.save();
    folder_rebuild_view();
}

let grabbed_elem = null;
function folder_start_drag(e) {
    grabbed_elem = e.target;
}

function folder_start_drag_hover(e) {
    e.target.classList.add("drag-target");
    e.preventDefault();
}

function folder_stop_drag_hover(e) {
    e.target.classList.remove("drag-target");
}

function folder_stop_drag(e) {
    e.preventDefault();
    if (grabbed_elem == null) return;

    e.target.classList.remove("drag-target");
    if (e.target == grabbed_elem) return;

    let old_path = grabbed_elem.getAttribute("data-filename");
    if (!old_path) return;
        
    let filename = old_path.substring(old_path.lastIndexOf("/") + 1);

    let new_path = null;
    if (e.target.classList.contains("directory")) {
        new_path = e.target.getAttribute("data-filename") + "/" + filename;
    } else if (e.target.classList.contains("folder-root")) {
        new_path = "/" + filename;
    }

    if (new_path) {
        folders.move_file(old_path, new_path);
        folders.save();
        folder_rebuild_view();
    }
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

function _convert_folders_into_payload(root, output) {
    switch (root.type) {
        case 'file':
            output[root.name] = root.contents;
            break;

        case 'dir':
            output[root.name] = {};
            for (let elem of root.elems) {
                _convert_folders_into_payload(elem, output[root.name]);
            }

            break;
    }
}

function folder_run() {
    folder_save_all_files();

    submit_code(() => {
        let payload = {};
        
        payload.config = {
            source_files: [folders.compilationTarget]
        };

        _convert_folders_into_payload({type: 'dir', name: 'files', elems: folders.folders}, payload);
        
        return fetch(window.ROOT_ENDPOINT + "/compile_v2", {
            method: 'POST',
            cache:  'no-cache',
            headers: {
                'Content-Type': 'application/json',
            },
            body:   JSON.stringify(payload),
        });
    });
}