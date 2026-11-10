// Веб-воркер: считает факториалы 1!..N! последовательно в фоне.
"use strict";

const MAX_N = 1000;
const DELAY_MS = 1000;

self.onmessage = async function (event) {
    const n = event.data;

    if (!Number.isInteger(n) || n < 1 || n > MAX_N) {
        self.postMessage({ error: `Некорректное число N (ожидалось целое от 1 до ${MAX_N}).` });
        return;
    }

    let fact = 1n;
    for (let i = 1; i <= n; i++) {
        fact *= BigInt(i);

        const done = i === n;
        self.postMessage({ n: i, value: fact.toString(), done });

        if (!done) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
    }
};