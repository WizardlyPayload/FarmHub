"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { ensureIdentityProposal, classify, parseIdentityDocument, publishIdentityProposalFtp, readProposalDownload } = require("../identityProvision");

function tempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-identity-"));
}

describe("identity proposal", () => {
    test("a new root gets one proposal and a second call does not replace it", () => {
        const root = tempRoot();
        const first = ensureIdentityProposal(root);
        const second = ensureIdentityProposal(root);
        expect(first.status).toBe("proposed");
        expect(second.status).toBe("proposal-present");
        expect(second.namespace).toBe(first.namespace);
        const bytes = fs.readFileSync(path.join(root, "identity-provision.xml"), "utf8");
        expect(bytes).toContain(`namespace="${first.namespace}"`);
        expect(fs.readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    test("a readable allocator is not replaced by a new proposal", () => {
        const root = tempRoot();
        fs.writeFileSync(path.join(root, "allocator-a.xml"), `<allocator namespace="aabbccddeeff0011" highWater="4" revision="2"/>\n`);
        const result = ensureIdentityProposal(root);
        expect(result.status).toBe("adopted-readonly");
        expect(fs.existsSync(path.join(root, "identity-provision.xml"))).toBe(false);
    });

    test("an unreadable ready file is recovery, not a new namespace", () => {
        const root = tempRoot();
        const ready = path.join(root, "identity-ready.xml");
        fs.mkdirSync(ready);
        const result = ensureIdentityProposal(root);
        expect(result.status).toBe("recovery-needed");
        expect(fs.existsSync(path.join(root, "identity-provision.xml"))).toBe(false);
    });

    test("K07 conflicting ready and allocator namespaces stay recovery", () => {
        const root = tempRoot();
        const ready = `<identityReady namespace="aabbccddeeff0011" revision="8"/>`;
        const allocator = `<allocator namespace="ffeeddccbbaa0099" highWater="7" revision="7"/>`;
        fs.writeFileSync(path.join(root, "identity-ready.xml"), ready);
        fs.writeFileSync(path.join(root, "allocator-a.xml"), allocator);
        const result = ensureIdentityProposal(root);
        expect(result.status).toBe("recovery-needed");
        expect(fs.readFileSync(path.join(root, "identity-ready.xml"), "utf8")).toBe(ready);
        expect(fs.readFileSync(path.join(root, "allocator-a.xml"), "utf8")).toBe(allocator);
        expect(fs.existsSync(path.join(root, "identity-provision.xml"))).toBe(false);
    });

    test("a competitor at publication keeps its namespace and a retry does not rewrite it", () => {
        const root = tempRoot();
        const proposal = path.join(root, "identity-provision.xml");
        const competitor = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<identityProvision version=\"1\" namespace=\"1111111111111111\"/>\n";
        const realLink = fs.linkSync;
        fs.linkSync = (from, to) => {
            fs.writeFileSync(to, competitor, { encoding: "utf8", flag: "wx" });
            return realLink(from, to);
        };
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            fs.linkSync = realLink;
        }
        expect(result).toEqual({ status: "proposal-present", namespace: "1111111111111111" });
        expect(fs.readFileSync(proposal, "utf8")).toBe(competitor);
        const again = ensureIdentityProposal(root);
        expect(again).toEqual({ status: "proposal-present", namespace: "1111111111111111" });
        expect(fs.readFileSync(proposal, "utf8")).toBe(competitor);
        expect(fs.readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    test("adopted allocator state during publication is not claimed as a new proposal", () => {
        const root = tempRoot();
        const allocator = "<allocator namespace=\"aabbccddeeff0011\" highWater=\"2\" revision=\"2\"/>";
        const realLink = fs.linkSync;
        fs.linkSync = (from, to) => {
            fs.writeFileSync(path.join(root, "allocator-a.xml"), allocator);
            return realLink(from, to);
        };
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            fs.linkSync = realLink;
        }
        expect(result).toEqual({ status: "adopted-readonly", namespace: "aabbccddeeff0011" });
        expect(fs.readFileSync(path.join(root, "allocator-a.xml"), "utf8")).toBe(allocator);
    });

    test("a damaged competitor at publication stays recovery and keeps its bytes", () => {
        const root = tempRoot();
        const proposal = path.join(root, "identity-provision.xml");
        const damaged = "<identityProvision version=\"1\" namespace=\"1111111111111111\"";
        const realLink = fs.linkSync;
        fs.linkSync = (from, to) => {
            fs.writeFileSync(to, damaged, { encoding: "utf8", flag: "wx" });
            return realLink(from, to);
        };
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            fs.linkSync = realLink;
        }
        expect(result.status).toBe("recovery-needed");
        expect(fs.readFileSync(proposal, "utf8")).toBe(damaged);
        expect(fs.readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    test("a damaged existing proposal is left in place", () => {
        const root = tempRoot();
        const damaged = "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"";
        fs.writeFileSync(path.join(root, "identity-provision.xml"), damaged);
        expect(ensureIdentityProposal(root).status).toBe("recovery-needed");
        expect(fs.readFileSync(path.join(root, "identity-provision.xml"), "utf8")).toBe(damaged);
    });

    test("a failed publication removes only the owned staging file", () => {
        const root = tempRoot();
        const realLink = fs.linkSync;
        fs.linkSync = () => {
            const error = new Error("link-failed");
            error.code = "EIO";
            throw error;
        };
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            fs.linkSync = realLink;
        }
        expect(result.status).toBe("proposal-failed");
        expect(fs.readdirSync(root)).toEqual([]);
    });

    test("a failed open leaves the destination absent", () => {
        const root = tempRoot();
        const realOpen = fs.openSync;
        fs.openSync = (file, flags) => {
            if (flags === "wx") {
                const error = new Error("open-failed");
                error.code = "EIO";
                throw error;
            }
            return realOpen(file, flags);
        };
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            fs.openSync = realOpen;
        }
        expect(result.status).toBe("proposal-failed");
        expect(fs.readdirSync(root)).toEqual([]);
    });

    test("a partial owned write is closed and removed, including a second retry", () => {
        const root = tempRoot();
        const proposal = path.join(root, "identity-provision.xml");
        const realWrite = fs.writeSync;
        const realClose = fs.closeSync;
        let writes = 0;
        let closes = 0;
        fs.writeSync = (fd, buffer, offset, length, position) => {
            writes += 1;
            realWrite(fd, buffer, offset, Math.min(23, length), position);
            const error = new Error("no-space");
            error.code = "ENOSPC";
            throw error;
        };
        fs.closeSync = (fd) => {
            closes += 1;
            return realClose(fd);
        };
        let first;
        let second;
        try {
            first = ensureIdentityProposal(root);
            second = ensureIdentityProposal(root);
        } finally {
            fs.writeSync = realWrite;
            fs.closeSync = realClose;
        }
        expect(writes).toBe(2);
        expect(closes).toBeGreaterThanOrEqual(2);
        expect(first.status).toBe("proposal-failed");
        expect(second.status).toBe("proposal-failed");
        expect(fs.existsSync(proposal)).toBe(false);
        expect(fs.readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    test("a close failure after a real write does not publish and removes the owned stage", () => {
        const root = tempRoot();
        const proposal = path.join(root, "identity-provision.xml");
        const realClose = fs.closeSync;
        let closes = 0;
        fs.closeSync = (fd) => {
            closes += 1;
            realClose(fd);
            const error = new Error("close-failed");
            error.code = "EIO";
            throw error;
        };
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            fs.closeSync = realClose;
        }
        expect(closes).toBeGreaterThanOrEqual(1);
        expect(result.status).toBe("proposal-failed");
        expect(fs.existsSync(proposal)).toBe(false);
        expect(fs.readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    test("a foreign stage that exclusive open cannot claim keeps its bytes", () => {
        const root = tempRoot();
        const foreignName = "identity-provision.xml." + process.pid + ".f9c454b5.tmp";
        const foreign = path.join(root, foreignName);
        const bytes = "foreign staging bytes";
        fs.writeFileSync(foreign, bytes);
        const realRandom = crypto.randomBytes;
        crypto.randomBytes = (size) => size === 4 ? Buffer.from("f9c454b5", "hex") : realRandom(size);
        let result;
        try {
            result = ensureIdentityProposal(root);
        } finally {
            crypto.randomBytes = realRandom;
        }
        expect(result.status).toBe("proposal-failed");
        expect(fs.readFileSync(foreign, "utf8")).toBe(bytes);
        expect(fs.existsSync(path.join(root, "identity-provision.xml"))).toBe(false);
    });
});

describe("ftp identity proposal", () => {
    test("an empty listing does not upload because FTP cannot create without replacement", async () => {
        let uploads = 0;
        const client = {
            list: async () => [],
            uploadFrom: async () => { uploads += 1; },
            downloadTo: async () => { throw new Error("readback"); },
        };
        const result = await publishIdentityProposalFtp(client, "profile/modSettings/FS25_FarmDashboard");
        expect(result).toEqual({ status: "provisioning-required", uploads: 0 });
        expect(uploads).toBe(0);
    });

    test("M04 a 550 permission error is not absence and does not upload", async () => {
        let uploads = 0;
        const client = {
            size: async () => {
                const error = new Error("550 Permission denied");
                error.code = 550;
                throw error;
            },
            uploadFrom: async () => { uploads += 1; },
        };
        const result = await publishIdentityProposalFtp(client, "profile/modSettings/FS25_FarmDashboard");
        expect(result.status).toBe("remote-unknown");
        expect(uploads).toBe(0);
    });

    test("N06 a client that cannot read a proposal back does not upload", async () => {
        let uploads = 0;
        const client = {
            list: async () => [],
            uploadFrom: async () => { uploads += 1; },
        };
        const result = await publishIdentityProposalFtp(client, "profile/modSettings/FS25_FarmDashboard");
        expect(result).toEqual({ status: "provisioning-required", uploads: 0 });
        expect(uploads).toBe(0);
    });

    test("N07 an empty listing does not become a proposal after junk readback", async () => {
        let uploads = 0;
        const client = {
            list: async () => [],
            uploadFrom: async () => { uploads += 1; },
            downloadTo: async (sink) => {
                sink.write(Buffer.from("NOT AN XML DOCUMENT"));
                sink.end();
            },
        };
        const result = await publishIdentityProposalFtp(client, "profile/modSettings/FS25_FarmDashboard");
        expect(result).toEqual({ status: "provisioning-required", uploads: 0 });
        expect(uploads).toBe(0);
    });
});

describe("strict identity documents", () => {
    function bytes(root) {
        return ["identity-provision.xml", "identity-ready.xml", "allocator-a.xml", "allocator-b.xml"]
            .filter((name) => fs.existsSync(path.join(root, name)))
            .map((name) => name + "=" + fs.readFileSync(path.join(root, name), "utf8"))
            .join("|");
    }

    test("the four supplied failures stay recovery or unverified and keep existing bytes", async () => {
        const truncated = tempRoot();
        const truncatedBody = "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"";
        fs.writeFileSync(path.join(truncated, "identity-provision.xml"), truncatedBody);
        const truncatedResult = ensureIdentityProposal(truncated);
        expect(truncatedResult.status).toBe("recovery-needed");
        expect(fs.readFileSync(path.join(truncated, "identity-provision.xml"), "utf8")).toBe(truncatedBody);

        const comment = tempRoot();
        const commentBody = "<!-- <allocator namespace=\"aabbccddeeff0011\" highWater=\"1\" revision=\"1\"/> -->";
        fs.writeFileSync(path.join(comment, "allocator-a.xml"), commentBody);
        const commentResult = ensureIdentityProposal(comment);
        expect(commentResult.status).toBe("recovery-needed");
        expect(fs.readFileSync(path.join(comment, "allocator-a.xml"), "utf8")).toBe(commentBody);
        expect(fs.existsSync(path.join(comment, "identity-provision.xml"))).toBe(false);

        const damaged = tempRoot();
        const before = {
            "identity-ready.xml": "<identityReady namespace=\"aabbccddeeff0011\" revision=\"2\"/>",
            "allocator-a.xml": "<allocator namespace=\"aabbccddeeff0011\" highWater=\"2\" revision=\"2\"/>",
            "allocator-b.xml": "<allocator highWater=\"garbage\" revision=\"garbage\"/>",
        };
        Object.entries(before).forEach(([name, body]) => fs.writeFileSync(path.join(damaged, name), body));
        const damagedResult = ensureIdentityProposal(damaged);
        expect(damagedResult.status).toBe("recovery-needed");
        expect(bytes(damaged)).toBe(Object.entries(before).map(([name, body]) => name + "=" + body).join("|"));

        let uploads = 0;
        const client = {
            list: async () => [],
            uploadFrom: async () => { uploads += 1; },
        };
        const ftp = await publishIdentityProposalFtp(client, "profile/modSettings/FS25_FarmDashboard");
        expect(ftp).toEqual({ status: "provisioning-required", uploads: 0 });
        expect(uploads).toBe(0);
        const readback = await readProposalDownload({
            downloadTo: async (sink) => {
                sink.write(Buffer.from("<identityProvision version=\"1\"namespace=\"aabbccddeeff0011\"/>"));
                sink.end();
            },
        }, "identity-provision.xml");
        expect(Buffer.isBuffer(readback)).toBe(true);
        expect(parseIdentityDocument(readback.toString("utf8"), "identityProvision")).toBeNull();
    });

    test("valid native shapes and one-allocator records are read only", () => {
        const shapes = [
            ["allocator-a.xml", "<allocator namespace=\"aabbccddeeff0011\" highWater=\"0\" revision=\"0\"/>"],
            ["allocator-b.xml", "<?xml version=\"1.0\" encoding=\"utf-8\" standalone=\"no\"?>\n<allocator revision=\"4\" highWater=\"9\" namespace=\"aabbccddeeff0011\"/>\n"],
            ["identity-ready.xml", "<identityReady revision=\"4\" namespace=\"aabbccddeeff0011\"/>"],
        ];
        const root = tempRoot();
        shapes.forEach(([name, body]) => fs.writeFileSync(path.join(root, name), body));
        const result = ensureIdentityProposal(root);
        expect(result).toEqual({ status: "adopted-readonly", namespace: "aabbccddeeff0011" });
        shapes.forEach(([name, body]) => {
            expect(fs.readFileSync(path.join(root, name), "utf8")).toBe(body);
        });

        const onlyA = tempRoot();
        fs.writeFileSync(path.join(onlyA, "allocator-a.xml"), "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1\" revision=\"1\"/>");
        expect(ensureIdentityProposal(onlyA).status).toBe("adopted-readonly");
        const onlyB = tempRoot();
        fs.writeFileSync(path.join(onlyB, "allocator-b.xml"), "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1\" revision=\"1\"/>");
        expect(ensureIdentityProposal(onlyB).status).toBe("adopted-readonly");
    });

    test("malformed documents and bad counters do not create a namespace", () => {
        const samples = [
            ["identity-provision.xml", "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"></identityProvision>"],
            ["identity-provision.xml", "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/> junk"],
            ["allocator-a.xml", "<allocator namespace=\"AABBCCDDEEFF0011\" highWater=\"1\" revision=\"1\"/>"],
            ["allocator-a.xml", "<allocator namespace=\"aabbccddeeff0011\" highWater=\"01\" revision=\"1\"/>"],
            ["allocator-a.xml", "<allocator namespace=\"aabbccddeeff0011\" highWater=\"-1\" revision=\"1\"/>"],
            ["allocator-a.xml", "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1.5\" revision=\"1\"/>"],
            ["allocator-a.xml", "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1e2\" revision=\"1\"/>"],
            ["allocator-a.xml", "<allocator namespace=\"aabbccddeeff0011\" highWater=\"2147483648\" revision=\"1\"/>"],
            ["identity-ready.xml", "<identityReady namespace=\"aabbccddeeff0011\" revision=\"3\"/>"],
            ["allocator-b.xml", "<not-xml"],
        ];
        const readyAhead = tempRoot();
        fs.writeFileSync(path.join(readyAhead, "identity-ready.xml"), "<identityReady namespace=\"aabbccddeeff0011\" revision=\"5\"/>");
        fs.writeFileSync(path.join(readyAhead, "allocator-a.xml"), "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1\" revision=\"4\"/>");
        expect(ensureIdentityProposal(readyAhead).status).toBe("recovery-needed");
        const readyAlone = tempRoot();
        fs.writeFileSync(path.join(readyAlone, "identity-ready.xml"), "<identityReady namespace=\"aabbccddeeff0011\" revision=\"1\"/>");
        expect(ensureIdentityProposal(readyAlone).status).toBe("recovery-needed");
        samples.forEach(([name, body]) => {
            const root = tempRoot();
            fs.writeFileSync(path.join(root, name), body);
            const before = fs.readFileSync(path.join(root, name));
            expect(ensureIdentityProposal(root).status).toBe("recovery-needed");
            expect(fs.readFileSync(path.join(root, name))).toEqual(before);
            if (name !== "identity-provision.xml") {
                expect(fs.existsSync(path.join(root, "identity-provision.xml"))).toBe(false);
            }
        });
        const capped = tempRoot();
        fs.writeFileSync(path.join(capped, "allocator-a.xml"), "<allocator namespace=\"aabbccddeeff0011\" highWater=\"2147483647\" revision=\"2147483647\"/>");
        expect(ensureIdentityProposal(capped)).toEqual({ status: "adopted-readonly", namespace: "aabbccddeeff0011" });
        const stale = tempRoot();
        const staleProposal = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<identityProvision version=\"1\" namespace=\"0011223344556677\"/>\n";
        fs.writeFileSync(path.join(stale, "identity-provision.xml"), staleProposal);
        fs.writeFileSync(path.join(stale, "allocator-a.xml"), "<allocator namespace=\"aabbccddeeff0011\" highWater=\"2\" revision=\"2\"/>");
        expect(ensureIdentityProposal(stale)).toEqual({ status: "adopted-readonly", namespace: "aabbccddeeff0011" });
        expect(fs.readFileSync(path.join(stale, "identity-provision.xml"), "utf8")).toBe(staleProposal);
    });

    test("ftp listings that are not a completed empty file list do not upload", async () => {
        const file = (name) => ({ name, type: 1 });
        const cases = [
            { list: async () => [file("identity-ready.xml")], status: "remote-present-not-replaced" },
            { list: async () => [file("allocator-a.xml")], status: "remote-present-not-replaced" },
            { list: async () => [file("allocator-b.xml")], status: "remote-present-not-replaced" },
            { list: async () => [file("identity-provision.xml")], status: "proposal-present" },
            { list: async () => { const error = new Error("550"); error.code = 550; throw error; }, status: "remote-unknown" },
            { list: async () => "nope", status: "remote-unknown" },
            { list: async () => [{ name: "identity-ready.xml", type: 2 }], status: "remote-unknown" },
            { list: async () => [file("identity-ready.xml"), file("identity-ready.xml")], status: "remote-unknown" },
            { list: async () => [], uploadFrom: async () => { throw new Error("partial"); }, status: "provisioning-required" },
        ];
        for (const item of cases) {
            let uploads = 0;
            const client = {
                list: item.list,
                uploadFrom: item.uploadFrom || (async () => { uploads += 1; }),
                downloadTo: async () => { throw new Error("readback"); },
            };
            const result = await publishIdentityProposalFtp(client, "profile/modSettings/FS25_FarmDashboard");
            expect(result.status).toBe(item.status);
            expect(result.uploads || 0).toBe(0);
            expect(uploads).toBe(0);
        }
        const noUpload = await publishIdentityProposalFtp({
            list: async () => [],
            downloadTo: async () => {},
        }, "profile/modSettings/FS25_FarmDashboard");
        expect(noUpload).toEqual({ status: "provisioning-required", uploads: 0 });
    });

    test("malformed proposal readback stays unverified and an empty listing still does not upload", async () => {
        const original = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>\n";
        const bodies = [
            original.replace("version=\"1\" namespace=", "version=\"1\" version=\"1\" namespace="),
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<identityReady namespace=\"aabbccddeeff0011\" revision=\"1\"/>\n",
            "<!-- <identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/> -->",
            "<!DOCTYPE identityProvision>\n<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>",
            original + "\ntrailing",
            original.replace("namespace=\"aabbccddeeff0011\"", "namespace=\"0011223344556677\""),
            "x".repeat(513),
        ];
        for (const body of bodies) {
            const readback = await readProposalDownload({
                downloadTo: async (sink) => {
                    sink.write(Buffer.from(body));
                    sink.end();
                },
            }, "identity-provision.xml");
            const record = Buffer.isBuffer(readback)
                ? parseIdentityDocument(readback.toString("utf8"), "identityProvision")
                : null;
            if (body.includes("0011223344556677")) expect(record.namespace).toBe("0011223344556677");
            else expect(record).toBeNull();
        }
        let uploads = 0;
        const published = await publishIdentityProposalFtp({
            list: async () => [],
            uploadFrom: async () => { uploads += 1; },
        }, "profile/modSettings/FS25_FarmDashboard");
        expect(published).toEqual({ status: "provisioning-required", uploads: 0 });
        expect(uploads).toBe(0);
    });

    test("empty, oversized, badly encoded, and unreadable peers stay closed", () => {
        const closed = [
            ["identity-provision.xml", ""],
            ["identity-provision.xml", "<identityProvision version=\"2\" namespace=\"aabbccddeeff0011\"/>"],
            ["identity-provision.xml", "<identityProvision version=\"1\" version=\"1\" namespace=\"aabbccddeeff0011\"/>"],
            ["identity-provision.xml", "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\" extra=\"1\"/>"],
            ["identity-provision.xml", "<!DOCTYPE identityProvision><identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>"],
        ];
        closed.forEach(([, body], index) => {
            const root = tempRoot();
            const name = closed[index][0];
            fs.writeFileSync(path.join(root, name), body);
            expect(ensureIdentityProposal(root).status).toBe("recovery-needed");
            expect(fs.readFileSync(path.join(root, name), "utf8")).toBe(body);
        });
        const huge = tempRoot();
        fs.writeFileSync(path.join(huge, "allocator-a.xml"), Buffer.alloc(8193, 0x61));
        expect(ensureIdentityProposal(huge).status).toBe("recovery-needed");
        const encoded = tempRoot();
        fs.writeFileSync(path.join(encoded, "allocator-a.xml"), Buffer.from([0xff, 0xfe, 0xfd]));
        expect(ensureIdentityProposal(encoded).status).toBe("recovery-needed");
        const peer = tempRoot();
        fs.writeFileSync(path.join(peer, "allocator-a.xml"), "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1\" revision=\"1\"/>");
        fs.mkdirSync(path.join(peer, "allocator-b.xml"));
        expect(ensureIdentityProposal(peer).status).toBe("recovery-needed");
        expect(fs.existsSync(path.join(peer, "identity-provision.xml"))).toBe(false);
    });
});

describe("identity readback settlement", () => {
    function within(work) {
        return Promise.race([
            work,
            new Promise((resolve) => setTimeout(() => resolve({ status: "still-pending" }), 150)),
        ]);
    }

    function client(downloadTo) {
        return { downloadTo };
    }

    test("a rejected download settles as unverified without an extra sink event", async () => {
        const beforeWrite = await within(readProposalDownload(client(async () => {
            throw new Error("readback");
        }), "identity-provision.xml"));
        expect(beforeWrite).toBeNull();

        const afterPartial = await within(readProposalDownload(client(async (sink) => {
            sink.write(Buffer.from("<identityProvision"));
            throw new Error("partial");
        }), "identity-provision.xml"));
        expect(afterPartial).toBeNull();

        const afterSinkFailure = await within(readProposalDownload(client(async (sink) => {
            sink.write(Buffer.alloc(513, 120));
            await new Promise((resolve) => setTimeout(resolve, 20));
            throw new Error("after-sink-failure");
        }), "identity-provision.xml"));
        expect(afterSinkFailure).toBeNull();
    });

    test("premature close is unverified and a finished readback still parses", async () => {
        const closed = await within(readProposalDownload(client(async (sink) => {
            sink.write(Buffer.from("partial"));
            sink.destroy();
        }), "identity-provision.xml"));
        expect(closed).toBeNull();

        const body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>\n";
        const finished = await readProposalDownload({
            downloadTo: async (sink) => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                sink.write(Buffer.from(body));
                sink.end();
                await new Promise((resolve) => setImmediate(resolve));
                sink.emit("error", new Error("late-duplicate"));
            },
        }, "identity-provision.xml");
        expect(parseIdentityDocument(finished.toString("utf8"), "identityProvision").namespace).toBe("aabbccddeeff0011");
    });

    test("a strict child survives a capped sink and a delayed transfer rejection", () => {
        const source = [
            "const { readProposalDownload } = require('./identityProvision.js');",
            "const client = {",
            "  downloadTo: async (sink) => {",
            "    sink.write(Buffer.alloc(513, 120));",
            "    await new Promise((resolve) => setTimeout(resolve, 50));",
            "    throw new Error('delayed transfer rejection');",
            "  },",
            "};",
            "readProposalDownload(client, 'identity-provision.xml').then((result) => {",
            "  console.log('RESULT ' + JSON.stringify(result));",
            "}, (error) => {",
            "  console.error('OUTER_REJECTION ' + String(error));",
            "  process.exitCode = 2;",
            "});",
        ].join("");
        const child = spawnSync(process.execPath, ["--unhandled-rejections=strict", "-e", source], {
            cwd: path.join(__dirname, ".."),
            encoding: "utf8",
            timeout: 15000,
        });
        expect(child.status).toBe(0);
        expect(child.stdout).toContain("RESULT null");
    });
});

describe("bounded short reads and unknown roots", () => {
    function withReads(maxChunk, run, options) {
        const realRead = fs.readSync;
        const realClose = fs.closeSync;
        let reads = 0;
        let closes = 0;
        const closed = new Set();
        fs.readSync = function (fd, buffer, offset, length, position) {
            reads += 1;
            if (options && options.failRead === reads) throw new Error("read-failed");
            const requested = maxChunk == null ? length : Math.min(length, maxChunk);
            return realRead.call(fs, fd, buffer, offset, requested, position);
        };
        fs.closeSync = function (fd) {
            closes += 1;
            if (!closed.has(fd)) {
                realClose.call(fs, fd);
                closed.add(fd);
            }
            if (options && options.failClose) throw new Error("close-failed");
        };
        try {
            return { result: run(), reads: () => reads, closes: () => closes };
        } finally {
            fs.readSync = realRead;
            fs.closeSync = realClose;
        }
    }

    test("short reads keep the whole document and do not accept a valid prefix", () => {
        const proposal = "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>";
        [1, 10, proposal.length].forEach((chunk) => {
            const root = tempRoot();
            fs.writeFileSync(path.join(root, "identity-provision.xml"), proposal);
            const seen = withReads(chunk, () => ensureIdentityProposal(root));
            expect(seen.result).toEqual({ status: "proposal-present", namespace: "aabbccddeeff0011" });
            expect(seen.reads()).toBeGreaterThan(1);
            expect(seen.closes()).toBe(1);
            expect(fs.readFileSync(path.join(root, "identity-provision.xml"), "utf8")).toBe(proposal);
        });

        const junked = tempRoot();
        const junk = proposal + " TRAILING-JUNK";
        fs.writeFileSync(path.join(junked, "identity-provision.xml"), junk);
        const prefix = withReads(proposal.length, () => ensureIdentityProposal(junked));
        expect(prefix.result.status).toBe("recovery-needed");
        expect(prefix.reads()).toBeGreaterThan(1);
        expect(prefix.closes()).toBe(1);
        expect(fs.readFileSync(path.join(junked, "identity-provision.xml"), "utf8")).toBe(junk);

        const empty = tempRoot();
        fs.writeFileSync(path.join(empty, "identity-provision.xml"), "");
        expect(withReads(10, () => ensureIdentityProposal(empty)).result.status).toBe("recovery-needed");

        const exact = tempRoot();
        fs.writeFileSync(path.join(exact, "allocator-a.xml"), Buffer.alloc(8192, 0x61));
        const exactSeen = withReads(8192, () => ensureIdentityProposal(exact));
        expect(exactSeen.result.status).toBe("recovery-needed");
        expect(fs.existsSync(path.join(exact, "identity-provision.xml"))).toBe(false);

        const over = tempRoot();
        fs.writeFileSync(path.join(over, "allocator-a.xml"), Buffer.alloc(8193, 0x61));
        const overSeen = withReads(4096, () => ensureIdentityProposal(over));
        expect(overSeen.result.status).toBe("recovery-needed");
        expect(overSeen.reads()).toBeLessThan(5);
        expect(fs.existsSync(path.join(over, "identity-provision.xml"))).toBe(false);
    });

    test("a later read or close failure stays closed and a damaged peer creates nothing", () => {
        const root = tempRoot();
        const body = "<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>";
        fs.writeFileSync(path.join(root, "identity-provision.xml"), body);
        const failedRead = withReads(10, () => ensureIdentityProposal(root), { failRead: 2 });
        expect(failedRead.result.status).toBe("recovery-needed");
        expect(failedRead.closes()).toBe(1);
        expect(fs.readFileSync(path.join(root, "identity-provision.xml"), "utf8")).toBe(body);

        const closed = tempRoot();
        fs.writeFileSync(path.join(closed, "identity-provision.xml"), body);
        const failedClose = withReads(body.length, () => ensureIdentityProposal(closed), { failClose: true });
        expect(failedClose.result.status).toBe("recovery-needed");
        expect(failedClose.closes()).toBe(1);

        const peer = tempRoot();
        const damaged = "<allocator namespace=\"aabbccddeeff0011\" highWater=\"1\" revision=\"1\"/> TRAILING";
        fs.writeFileSync(path.join(peer, "allocator-a.xml"), damaged);
        const adopted = withReads(20, () => ensureIdentityProposal(peer));
        expect(adopted.result.status).toBe("recovery-needed");
        expect(fs.existsSync(path.join(peer, "identity-provision.xml"))).toBe(false);
        expect(fs.readFileSync(path.join(peer, "allocator-a.xml"), "utf8")).toBe(damaged);
    });

    test("inherited and unknown roots are invalid without throwing", () => {
        const bodies = [
            "<constructor/>",
            "<constructor version=\"1\"/>",
            "<toString/>",
            "<toString namespace=\"aabbccddeeff0011\"/>",
            "<valueOf/>",
            "<valueOf highWater=\"1\"/>",
            "<unknownRoot/>",
            "<unknownRoot namespace=\"aabbccddeeff0011\"/>",
        ];
        bodies.forEach((body) => {
            expect(parseIdentityDocument(body)).toBeNull();
            expect(parseIdentityDocument(body, "identityProvision")).toBeNull();
            expect(parseIdentityDocument(body, "allocator")).toBeNull();
            const root = tempRoot();
            const file = path.join(root, "identity-provision.xml");
            fs.writeFileSync(file, body);
            expect(classify(file)).toEqual({ state: "invalid" });
        });
        expect(parseIdentityDocument("<identityProvision version=\"1\" namespace=\"aabbccddeeff0011\"/>").namespace).toBe("aabbccddeeff0011");
    });
});
