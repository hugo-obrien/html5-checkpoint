(() => {
    "use strict";

    const input = document.getElementById("n-input");
    const runBtn = document.getElementById("run-btn");
    const stopBtn = document.getElementById("stop-btn");
    const clearConsoleBtn = document.getElementById("clear-console");
    const consoleEl = document.getElementById("console");
    const statusEl = document.getElementById("worker-status");

    const MAX_N = 1000;
    const MAX_LINES = 2000;
    const SPIN_FRAMES = ["-", "\\", "|", "/"];
    const SPIN_INTERVAL_MS = 200;
    const SPIN_TEXT = "считаю";

    let worker = null;
    let busy = false;
    let spinnerEl = null;
    let spinnerTimer = null;

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.classList.remove("success", "error");
        if (kind) statusEl.classList.add(kind);
    }

    function clearStatus() {
        statusEl.textContent = "";
        statusEl.classList.remove("success", "error");
    }

    function startSpinner() {
        if (spinnerEl) return;
        let idx = 0;
        spinnerEl = document.createElement("div");
        spinnerEl.className = "console-line console-spinner";
        spinnerEl.textContent = `${SPIN_FRAMES[idx]} ${SPIN_TEXT}`;
        consoleEl.appendChild(spinnerEl);
        spinnerTimer = setInterval(() => {
            idx = (idx + 1) % SPIN_FRAMES.length;
            spinnerEl.textContent = `${SPIN_FRAMES[idx]} ${SPIN_TEXT}`;
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }, SPIN_INTERVAL_MS);
    }

    function stopSpinner() {
        if (spinnerTimer) clearInterval(spinnerTimer);
        spinnerTimer = null;
        if (spinnerEl && spinnerEl.parentNode) spinnerEl.remove();
        spinnerEl = null;
    }

    function appendLine(text, kind) {
        const line = document.createElement("div");
        line.className = "console-line" + (kind ? " console-" + kind : "");
        line.textContent = text;

        if (spinnerEl) {
            consoleEl.insertBefore(line, spinnerEl);
        } else {
            consoleEl.appendChild(line);
        }

        // Keep the console from growing unbounded.
        while (consoleEl.children.length > MAX_LINES + (spinnerEl ? 1 : 0)) {
            consoleEl.removeChild(consoleEl.firstChild);
        }
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function terminateWorker() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
        busy = false;
        runBtn.disabled = false;
        stopBtn.disabled = true;
        stopSpinner();
    }

    // Validate user input as a natural number at the UI layer.
    function validate() {
        const value = input.value.trim();
        const n = Number(value);
        if (value === "") {
            return { ok: false, msg: "Enter number" };
        }
        if (!Number.isInteger(n)) {
            return { ok: false, msg: "Number must be an integer" };
        }
        if (n < 1) {
            return { ok: false, msg: "Number must be over 0" };
        }
        if (n > MAX_N) {
            return { ok: false, msg: `Max value — ${MAX_N}` };
        }
        return { ok: true, n };
    }

    function run() {
        const result = validate();
        if (!result.ok) {
            setStatus(result.msg, "error");
            return;
        }
        const n = result.n;

        if (busy) {
            setStatus("Already in progress", "error");
            return;
        }
        if (worker) terminateWorker();

        setStatus("Starting worker…");
        appendLine(`> print factorials up to ${n}`);

        busy = true;
        runBtn.disabled = true;
        stopBtn.disabled = false;

        try {
            worker = new Worker("js/factorial-worker.js");
        } catch (err) {
            busy = false;
            runBtn.disabled = false;
            stopBtn.disabled = true;
            setStatus("Failed to create Web Worker: " + err.message, "error");
            appendLine("Error: failed to create worker.", "error");
            return;
        }

        startSpinner();

        worker.onmessage = (event) => {
            const data = event.data;
            if (data.error) {
                appendLine("Error: " + data.error, "error");
                setStatus(data.error, "error");
                terminateWorker();
                return;
            }
            appendLine(`${data.n}! = ${data.value}`);
            if (data.done) {
                stopSpinner();
                appendLine("Calculations finished", "done");
                terminateWorker();
                setStatus(`Finished: fcatorials up to ${data.n} printed`, "success");
            }
        };

        worker.onerror = (err) => {
            appendLine("Worker exception: " + err.message, "error");
            setStatus("Worker exception: " + err.message, "error");
            terminateWorker();
        };

        worker.postMessage(n);
    }

    runBtn.addEventListener("click", run);

    stopBtn.addEventListener("click", () => {
        terminateWorker();
        stopSpinner();
        appendLine("Calculations stopped by user", "done");
        setStatus("Calculations stopped");
    });

    clearConsoleBtn.addEventListener("click", () => {
        stopSpinner();
        consoleEl.textContent = "";
        setStatus("Console cleared");
        setTimeout(clearStatus, 1500);
    });

    // Pressing Enter in the field triggers the same action.
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            run();
        }
    });

    // Block user editing of the console (belt and suspenders).
    input.addEventListener("focus", () => input.select());
})();