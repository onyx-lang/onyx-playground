class Editor {
    constructor(target_id) {
        this.target_id = target_id;
        this.editor = ace.edit(target_id);

        this.setTheme("chrome");
        this.setKeybindings("normal");

        this.editor.setShowPrintMargin(false);
        this.editor.setFontSize(16);
        this.editor.getSession().setMode("ace/mode/onyx");
        
        this.tabs = [];
        this.tabContainer = $("#tab-container");
        this.switchToTab(-1);

        this.tabContainer.on("wheel", e => {
            e = e.originalEvent;
            if (!e.deltaY) {
                return;
            }
        
            e.currentTarget.scrollLeft += e.deltaY + e.deltaX;
            e.preventDefault();
        });
    }

    getText() {
        return this.editor.getValue();
    }

    setText(contents) {
        this.editor.setValue(contents);
    }

    getActiveFilePath() {
        if (this.selectedTab >= this.tabs.length) return "";
        return this.tabs[this.selectedTab].path;
    }

    clearSelection() {
        this.editor.clearSelection();
    }

    setAnnotations(annotations) {
        this.editor.getSession().setAnnotations(annotations);
    }

    setTheme(theme) {
        this.theme = theme;
        this.editor.setTheme(`ace/theme/${theme}`);
    }

    setKeybindings(keybindings) {
        this.keybinds = keybindings;

        if (this.keybinds == "normal") this.editor.setKeyboardHandler("");
        else                           this.editor.setKeyboardHandler(`ace/keyboard/${this.keybinds}`);
    }

    _makeNewSession(contents, path) {
        let session = ace.createEditSession(contents, "ace/mode/onyx");
        session.on("change", this.markTabAsUnsaved.bind(this, path));

        return session;
    }

    getTabState() {
        return this.tabs.map(x => ({
            name: x.name,
            path: x.path,
            saved: true,
            selected: x.selected
        }));
    }

    /**
     * @param state Array of tabs, as returned from `getTabState`
     */
    setTabState(state, getContentsForPath) {
        this.tabs = state ?? [];

        this.tabs.forEach(tab => {
            tab.session = this._makeNewSession(getContentsForPath(tab.path), tab.path)
        });

        this._rebuildTabBar();

        this.switchToTab(this.tabs.findIndex(x => x.selected));
    }
    
    switchToTab(index) {
        this._hideEditor(index < 0);

        this.tabContainer.children().removeClass("selected");
        this.tabs.forEach(x => x.selected = false);

        this.selectedTab = index;
        if (index >= 0) {
            this.tabContainer.children()
                .eq(index)
                .addClass("selected")
                [0].scrollIntoView(false);

            this.editor.setSession(this.tabs[index].session);
            this.tabs[index].selected = true;
        }
    }

    openOrSwitchToTab(filepath, shortname, getContents) {
        let match = this.tabs.findIndex(x => x.path == filepath);
        if (match >= 0) {
            this.switchToTab(match);
            return;
        }

        let newtab = {
            session: this._makeNewSession(getContents(), filepath),
            name: shortname,
            path: filepath,
            saved: true,
            selected: false
        };

        this.tabs.push(newtab);

        this._rebuildTabBar();

        this.switchToTab(this.tabs.length - 1);
    }

    markTabAsUnsaved(filepath) {
        let match = this.tabs.findIndex(x => x.path == filepath);
        if (match < 0) {
            return;
        }

        this.tabs[match].saved = false;
        $(`.tab[data-tabindex="${match}"]`).attr("data-unsaved", "true");
    }

    _rebuildTabBar() {
        let newContent = "";
        this.tabs.forEach((tab, index) => {
            newContent += `
                <div class="tab ${tab.selected ? "selected" : ""}" data-tabindex="${index}" data-unsaved="${!tab.saved}">
                    ${tab.name}
                    <i class="close-button fa fa-close"></i>
                </div>
            `;
        });
        this.tabContainer.html(newContent);

        $("#tab-container .tab").each((_, x) => {
            $(x).on("click", this.switchToTab.bind(this, $(x).data("tabindex")))
        });
        $("#tab-container .tab .close-button").each((_, x) => {
            $(x).on("click", this.closeTab.bind(this, $(x).closest(".tab").data("tabindex")))
        });
    }

    closeTabByPath(path) {
        let match = this.tabs.findIndex(x => x.path == path);
        if (match < 0) {
            return;
        }

        this.closeTab(match);
    }

    closeTab(index) {
        if (index >= this.tabs.length) return;

        if (!this.tabs[index].saved) {
            if (!confirm("There are unsaved changes. Are you sure you want to close it?")) return;
        }

        this.tabs[index].session.destroy();

        this.tabs.splice(index, 1);
        this.selectedTab = Math.min(this.selectedTab, this.tabs.length - 1);

        this._rebuildTabBar();
        this.switchToTab(this.selectedTab);
    }

    saveTab(filepath, save_func) {
        // TODO: Consider renaming tabs here...
        let match = this.tabs.findIndex(x => x.path == filepath);
        if (match < 0) {
            return;
        }

        if (save_func(this.tabs[match].session.getValue())) {
            this.tabs[match].saved = true;
            $(`.tab[data-tabindex="${match}"]`).attr("data-unsaved", "false");
        }
    }

    saveAllTabs(save_func) {
        this.tabs.forEach((tab, index) => {
            if (tab.saved) return;

            if (save_func(tab.path, tab.session.getValue())) {
                tab.saved = true;
                $(`.tab[data-tabindex="${index}"]`).attr("data-unsaved", "false");
            }
        });
    }

    _hideEditor(hidden) {
        if (hidden) {
            $(`#${this.target_id}`).hide();
            $(`#no-editor-open`).show();
        } else {
            $(`#${this.target_id}`).show();
            $(`#no-editor-open`).hide();
        }
    }
}