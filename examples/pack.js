// Rebuild www/static/examples_project.json from the programs in this directory.
const fs = require("fs");
const path = require("path");

const root = __dirname;
const outPath = path.join(root, "../www/static/examples_project.json");

function walk(dir) {
    return fs.readdirSync(dir).sort().map(name => {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            return { name, type: "dir", state: "open", elems: walk(full) };
        }
        return { name, type: "file", contents: fs.readFileSync(full, "utf8") };
    });
}

const project = {
    name: "Examples",
    editor: [
        { name: "about.onyx", path: "about.onyx", saved: true, selected: false },
        { name: "bounce.onyx", path: "canvas/bounce.onyx", saved: true, selected: true },
    ],
    compilationTarget: "canvas/bounce.onyx",
    files: walk(root).filter(entry => entry.name !== "pack.js"),
};

fs.writeFileSync(outPath, JSON.stringify(project));
console.log(outPath);
