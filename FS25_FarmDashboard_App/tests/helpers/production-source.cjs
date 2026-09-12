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

function productionTs(relative, mocks = {}) {
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    const localRequire = id => {
        if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
        if (id === 'preact/hooks') return require('../../../NEW APP/node_modules/preact/hooks');
        return createRequire(file)(id);
    };
    new Function('require', 'module', 'exports', 'document', 'window', output)(
        localRequire, module, module.exports, global.document, global.window,
    );
    return module.exports;
}

module.exports = { productionFunctions, productionTs };

