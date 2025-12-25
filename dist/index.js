"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const authController_1 = require("./controllers/authController");
const roomController_1 = require("./controllers/roomController");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.send('NexMeet Backend is running');
});
app.post('/login', authController_1.login);
app.post('/token', roomController_1.generateToken);
app.listen(config_1.config.port, () => {
    console.log(`Server running on port ${config_1.config.port}`);
});
