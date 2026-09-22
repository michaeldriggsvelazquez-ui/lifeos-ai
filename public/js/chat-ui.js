/* Scarpe AI - Chat UI System */

(function () {
    "use strict";

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function normalizeResponse(response) {
        if (typeof response === "string") {
            return {
                type: "message",
                title: null,
                subtitle: null,
                message: response,
                tasks: [],
                suggestions: []
            };
        }

        if (!response || typeof response !== "object") {
            return {
                type: "message",
                title: null,
                subtitle: null,
                message: "",
                tasks: [],
                suggestions: []
            };
        }

        return {
            type: response.type || "message",
            title: response.title || null,
            subtitle: response.subtitle || null,
            message: response.message || null,
            tasks: Array.isArray(response.tasks)
                ? response.tasks
                : [],
            suggestions: Array.isArray(response.suggestions)
                ? response.suggestions
                : []
        };
    }

    function addMessage(text, type) {
        const chat = document.getElementById("chat");

        if (!chat) {
            return null;
        }

        const messageElement = document.createElement("div");
        messageElement.className = `message ${type === "user" ? "user" : "ai"}`;

        const bubble = document.createElement("div");
        bubble.className = "bubble";

        bubble.textContent =
            text == null
                ? ""
                : String(text);

        messageElement.appendChild(bubble);
        chat.appendChild(messageElement);

        chat.scrollTop = chat.scrollHeight;

        return messageElement;
    }

    function createTask(task) {
        const taskElement = document.createElement("div");
        taskElement.className = "ai-task";

        const main = document.createElement("div");
        main.className = "ai-task-main";

        const title = document.createElement("div");
        title.className = "ai-task-title";
        title.textContent = task.title || "Tarea";

        main.appendChild(title);

        if (
