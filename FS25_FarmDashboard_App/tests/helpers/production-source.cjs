'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const ts = require('../../../NEW APP/node_modules/typescript');
const root = path.resolve(__dirname, '../../..');

function productionFunctions(relative, names, globals = {}) {
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const code = names.map(name => {
        const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
        if (!declaration) throw new Error('Missing production function: ' + name);
        return declaration.getText(ast).replace(/^export\s+/, '');
    }).join('\n') + '\nmodule.exports = {' + names.join(',') + '};';
    const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(output, {
        module, exports: module.exports, require: createRequire(file), __dirname: path.dirname(file),
        console, URL, Buffer, Date, setTimeout, clearTimeout, path, ...globals,
    });
    return module.exports;
}

let preactRuntimeCache = null;
function preactRuntime() {
    if (preactRuntimeCache) return preactRuntimeCache;
    const preactDir = path.join(root, "NEW APP/node_modules/preact");
    const preact = require(preactDir);
    const loaded = { exports: {} };
    const body = fs.readFileSync(path.join(preactDir, "hooks/dist/hooks.js"), "utf8");
    new Function("require", "module", "exports", body)((id) => (
        id === "preact" ? preact : null
    ), loaded, loaded.exports);
    preactRuntimeCache = { preact, hooks: loaded.exports };
    return preactRuntimeCache;
}

function productionTs(relative, mocks = {}) {
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.React,
            jsxFactory: "fdJsx",
            jsxFragmentFactory: "fdFragment",
        },
    }).outputText;
    const module = { exports: {} };
    const { preact, hooks } = preactRuntime();
    global.fdJsx = preact.h;
    global.fdFragment = preact.Fragment;
    const localRequire = id => {
        if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
        if (id.endsWith(".css")) return {};
        if (id === "preact") return preact;
        if (id === "preact/hooks") return hooks;
        if (id.startsWith("@/")) {
            const base = path.join(root, "NEW APP/src", id.slice(2));
            const hit = [base + ".ts", base + ".tsx", base + ".js", path.join(base, "index.ts")]
                .find((item) => fs.existsSync(item));
            if (!hit) throw new Error("Missing production alias " + id);
            if (hit.endsWith(".ts") || hit.endsWith(".tsx")) {
                return productionTs(path.relative(root, hit), mocks);
            }
            return createRequire(file)(hit);
        }
        if (id.startsWith(".")) {
            const base = path.resolve(path.dirname(file), id);
            const hit = [base, base + ".ts", base + ".tsx"].find((item) => /\.tsx?$/.test(item) && fs.existsSync(item));
            if (hit) return productionTs(path.relative(root, hit), mocks);
        }
        return createRequire(file)(id);
    };
    new Function('require', 'module', 'exports', 'document', 'window', output)(
        localRequire, module, module.exports, global.document, global.window,
    );
    return module.exports;
}

module.exports = { productionFunctions, productionTs, preactRuntime };

