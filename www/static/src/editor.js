class Editor {
    constructor(target_id) {
        this.editor = ace.edit(target_id);

        this.setTheme("chrome");
        this.setKeybindings("normal");

        this.editor.setShowPrintMargin(false);
        this.editor.setFontSize(16);
        this.editor.getSession().setMode("ace/mode/onyx");
        
        this.tabs = [];
        this.selectedTab = -1;
        this.tabContainer = $("#tab-container");

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
    
    switchToTab(index) {
        this.tabContainer.children().removeClass("selected");

        this.selectedTab = index;
        this.tabContainer.children()
            .eq(index)
            .addClass("selected")
            [0].scrollIntoView();

        this.editor.setSession(this.tabs[index].session);
    }

    openOrSwitchToTab(filepath, shortname, getContents) {
        let match = this.tabs.findIndex(x => x.path == filepath);
        if (match >= 0) {
            this.switchToTab(match);
            return;
        }

        let newtab = {
            session: new ace.createEditSession(getContents(), "ace/mode/onyx"),
            name: shortname,
            path: filepath
        };

        this.tabs.push(newtab);

        this._rebuildTabBar();

        this.switchToTab(this.tabs.length - 1);
    }

    _rebuildTabBar() {
        let newContent = "";
        this.tabs.forEach((tab, index) => {
            newContent += `
                <div class="tab" data-tabindex="${index}">
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

    closeTab(index) {
        if (index >= this.tabs.length) return;

        // Can't close the last open file
        if (this.tabs.length == 1) return;

        // TODO: Check for unsaved changes!

        this.tabs[index].session.destroy();

        this.tabs.splice(index, 1);
        this.selectedTab = Math.min(this.selectedTab, this.tabs.length - 1);

        this._rebuildTabBar();
        this.switchToTab(this.selectedTab);
    }
}