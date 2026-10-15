'use strict';

const fs = require('fs');
const path = require('path');

test('launching again shows a hidden dashboard before focusing it', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const start = source.indexOf('second-instance');
    expect(start).toBeGreaterThan(-1);
    const handler = source.slice(start, start + 1000);
    const show = handler.indexOf('mainWindow.show()');
    const focus = handler.indexOf('mainWindow.focus()');
    expect(show).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(show);
});
