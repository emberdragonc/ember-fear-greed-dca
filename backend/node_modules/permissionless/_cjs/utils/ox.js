"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
exports.getOxModule = getOxModule;
exports.hasOxModule = hasOxModule;
exports.getOxExports = getOxExports;
let oxModule = null;
try {
    const importPromise = Promise.resolve().then(() => tslib_1.__importStar(require("ox")));
    oxModule = { importPromise };
}
catch (error) {
    // ox is not installed, this is fine for optional dependency
}
async function getOxModule() {
    if (!oxModule) {
        throw new Error("The 'ox' package is required for WebAuthn functionality. Please install it: npm install ox");
    }
    try {
        return await oxModule.importPromise;
    }
    catch (error) {
        throw new Error("The 'ox' package is required for WebAuthn functionality. Please install it: npm install ox");
    }
}
function hasOxModule() {
    return oxModule !== null;
}
async function getOxExports() {
    const ox = await getOxModule();
    return {
        Base64: ox.Base64,
        Hex: ox.Hex,
        PublicKey: ox.PublicKey,
        Signature: ox.Signature,
        WebAuthnP256: ox.WebAuthnP256
    };
}
//# sourceMappingURL=ox.js.map