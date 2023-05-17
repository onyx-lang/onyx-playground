function make_resizer(divider_id, css_width_prop_name, css_height_prop_name, on_resize) {
    const elem = document.getElementById(divider_id);
    const left_elem = elem.previousElementSibling;
    const right_elem = elem.nextElementSibling;
    const root = document.documentElement;

    let mx = 0;
    let my = 0;
    let left_width = 0;
    let top_height = 0;

    const mouse_move_handler = (e) => {
        const dx = e.clientX - mx;
        const dy = e.clientY - my;

        if (css_width_prop_name != null) {
            const pw = elem.parentNode.getBoundingClientRect().width;
            const lw = 100 * Math.min(pw - 10, Math.max(10, (left_width + dx))) / pw;
            root.style.setProperty(css_width_prop_name, `${lw}%`);
        }

        if (css_height_prop_name != null) {
            const ph = elem.parentNode.getBoundingClientRect().height;
            const th = 100 * Math.min(ph - 10, Math.max(10, (top_height + dy))) / ph;
            root.style.setProperty(css_height_prop_name, `${th}%`);
        }

        document.body.style.cursor = 'col-resize';

        left_elem.style.userSelect = 'none';
        left_elem.style.pointerEvents = 'none';

        right_elem.style.userSelect = 'none';
        right_elem.style.pointerEvents = 'none';

        if (on_resize != null) on_resize(e);
    };

    const mouse_up_handler = (e) => {
        document.removeEventListener("mousemove", mouse_move_handler);
        document.removeEventListener("mouseup",   mouse_up_handler);

        document.body.style.removeProperty("cursor");

        left_elem.style.removeProperty('user-select');
        left_elem.style.removeProperty('pointer-events');

        right_elem.style.removeProperty('user-select');
        right_elem.style.removeProperty('pointer-events');
    };

    const mouse_down_handler = (e) => {
        mx = e.clientX;
        my = e.clientY;
        left_width = left_elem.getBoundingClientRect().width;
        top_height = left_elem.getBoundingClientRect().height;

        document.addEventListener("mousemove", mouse_move_handler);
        document.addEventListener("mouseup",   mouse_up_handler);
    };

    elem.addEventListener("mousedown", mouse_down_handler);
}
