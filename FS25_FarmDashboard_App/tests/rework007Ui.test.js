/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const helpers = productionTs("NEW APP/src/sections/fields/field-helpers.ts", {
    "@/i18n/i18n": {
        t: (key, params) => (params && params.detail ? `${key}:${params.detail}` : key),
        tOr: (_key, fallback) => fallback,
    },
    "@/lib/rules-engine": {
        nitrogenTargetForDisplay: (field) => Number(field.targetNitrogen) || 0,
        PF_NUTRIENT_CLOSE_FRAC: 0.1,
    },
    "@/lib/field-harvest-state": { xmlGrowthLooksHarvested: () => false },
});

function paint(host, model) {
    host.innerHTML = "";
    const list = document.createElement("div");
    list.setAttribute("role", "listbox");
    list.style.width = model.narrow ? "280px" : "960px";
    model.sources.forEach((source, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = source.label;
        button.setAttribute("aria-label", `${source.label}, ${source.age}`);
        button.dataset.source = source.id;
        if (source.id === model.selected) button.setAttribute("aria-current", "true");
        button.tabIndex = source.id === model.selected ? 0 : -1;
        button.addEventListener("click", () => model.onSelect(source.id));
        list.appendChild(button);
        if (index === 0) button.dataset.edge = "first";
    });
    const status = document.createElement("p");
    const reading = helpers.resolveSoilReading(model.field);
    status.textContent = reading.nitrogen.reason === "held"
        ? helpers.overviewSoilLine(model.field)
        : reading.nitrogen.reason;
    status.dataset.reason = reading.nitrogen.reason;
    list.addEventListener("keydown", (event) => {
        const current = list.querySelector("[aria-current='true']");
        if (!current) return;
        if (event.key === "ArrowDown" && current.nextElementSibling) {
            current.nextElementSibling.focus();
            event.preventDefault();
        }
        if (event.key === "Enter" && document.activeElement && list.contains(document.activeElement)) {
            document.activeElement.click();
        }
    });
    host.append(list, status);
    const selectedButton = list.querySelector("[aria-current='true']");
    if (selectedButton) selectedButton.focus();
    return list;
}

describe("REWORK-007 browser fixture", () => {
    test("keyboard source switch keeps last-known soil distinct from a current read", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const sources = {
            A: {
                id: 1,
                nitrogenLevel: 100,
                targetNitrogen: 100,
                soilReadState: "partial",
                nitrogenReadState: "held",
                phReadState: "ok",
                isPrecisionFarming: true,
                isScanned: true,
            },
            B: {
                id: 2,
                nitrogenLevel: 40,
                targetNitrogen: 80,
                soilReadState: "ok",
                nitrogenReadState: "ok",
                phReadState: "ok",
                isPrecisionFarming: true,
                isScanned: true,
            },
        };
        let selected = "A";
        const model = () => ({
            narrow: window.innerWidth < 640,
            selected,
            sources: [
                { id: "A", label: "Farm A", age: "last-known" },
                { id: "B", label: "Farm B", age: "current" },
            ],
            field: sources[selected],
            onSelect: (id) => {
                selected = id;
                paint(host, model());
            },
        });
        window.innerWidth = 480;
        const list = paint(host, model());
        expect(list.style.width).toBe("280px");
        expect(host.querySelector("[data-reason]").dataset.reason).toBe("held");
        expect(host.querySelector("[data-reason]").textContent).toContain("fields.soilLastKnown");
        const buttons = host.querySelectorAll("button");
        buttons[0].focus();
        list.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement).toBe(buttons[1]);
        buttons[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(document.activeElement).toBe(host.querySelector("[data-source='B']"));
        expect(host.querySelector("[aria-current='true']").dataset.source).toBe("B");
        expect(host.querySelector("[data-reason]").dataset.reason).toBe("measured");
        expect(host.querySelector("[data-source='A']").getAttribute("aria-label")).toContain("last-known");
        window.innerWidth = 1200;
        paint(host, model());
        expect(host.querySelector("[role='listbox']").style.width).toBe("960px");
    });
});
