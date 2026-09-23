/* Scarpe AI - Chat UI System */

(function () {
    "use strict";

    /*
        =========================================================
        UTILIDADES
        =========================================================
    */

    function escapeHtml(value) {
        const div = document.createElement("div");

        div.textContent =
            value == null
                ? ""
                : String(value);

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

    function getChat() {
        return document.getElementById("chat");
    }

    function scrollToBottom() {
        const chat = getChat();

        if (!chat) {
            return;
        }

        requestAnimationFrame(function () {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    /*
        =========================================================
        ACCIONES DE MENSAJE
        =========================================================
    */

    function copyMessage(button) {
        const messageElement =
            button.closest(".message");

        if (!messageElement) {
            return;
        }

        const bubble =
            messageElement.querySelector(".bubble");

        if (!bubble) {
            return;
        }

        const text =
            bubble.innerText ||
            bubble.textContent ||
            "";

        if (!text.trim()) {
            return;
        }

        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {
            navigator.clipboard.writeText(text)
                .then(function () {
                    showTemporaryButtonState(
                        button,
                        "✓"
                    );
                })
                .catch(function () {
                    fallbackCopy(text, button);
                });

            return;
        }

        fallbackCopy(text, button);
    }

    function fallbackCopy(text, button) {
        const textarea =
            document.createElement("textarea");

        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        try {
            document.execCommand("copy");

            showTemporaryButtonState(
                button,
                "✓"
            );
        } catch (error) {
            console.error(
                "Scarpe AI: no se pudo copiar el mensaje.",
                error
            );
        }

        document.body.removeChild(textarea);
    }

    function showTemporaryButtonState(
        button,
        temporaryText
    ) {
        if (!button) {
            return;
        }

        const original =
            button.innerHTML;

        button.innerHTML =
            escapeHtml(temporaryText);

        setTimeout(function () {
            button.innerHTML = original;
        }, 1200);
    }

    function closeAllMessageMenus() {
        document
            .querySelectorAll(".message-options-menu")
            .forEach(function (menu) {
                menu.hidden = true;
            });
    }

    function toggleMessageOptions(button) {
        const container =
            button.closest(".message-options");

        if (!container) {
            return;
        }

        const menu =
            container.querySelector(
                ".message-options-menu"
            );

        if (!menu) {
            return;
        }

        const shouldOpen =
            menu.hidden !== false;

        closeAllMessageMenus();

        menu.hidden = !shouldOpen;
    }

    /*
        =========================================================
        ACCIONES ESPECIALES DE sAI
        =========================================================
    */

    function readMessageText(messageElement) {
        if (!messageElement) {
            return "";
        }

        const bubble =
            messageElement.querySelector(".bubble");

        if (!bubble) {
            return "";
        }

        return (
            bubble.innerText ||
            bubble.textContent ||
            ""
        ).trim();
    }

    function retryMessage(messageElement) {
        const text =
            readMessageText(messageElement);

        if (!text) {
            return;
        }

        closeAllMessageMenus();

        if (
            typeof window.sendMessage ===
            "function"
        ) {
            window.sendMessage(text);
            return;
        }

        document.dispatchEvent(
            new CustomEvent(
                "scarpe:retry-message",
                {
                    detail: {
                        message: text
                    }
                }
            )
        );
    }

    function newChatFromMessage(messageElement) {
        const text =
            readMessageText(messageElement);

        closeAllMessageMenus();

        if (
            typeof window.startNewConversation ===
            "function"
        ) {
            window.startNewConversation(text);
            return;
        }

        document.dispatchEvent(
            new CustomEvent(
                "scarpe:new-chat-from-message",
                {
                    detail: {
                        message: text
                    }
                }
            )
        );
    }

    /*
        =========================================================
        ACCIONES DE MENSAJE
        =========================================================
    */

    function createMessageActions(
        messageElement,
        type
    ) {
        const actions =
            document.createElement("div");

        actions.className =
            "message-actions";

        /*
            Copiar
        */

        const copyButton =
            document.createElement("button");

        copyButton.type = "button";
        copyButton.className =
            "message-action";

        copyButton.setAttribute(
            "aria-label",
            "Copiar mensaje"
        );

        copyButton.title =
            "Copiar mensaje";

        copyButton.innerHTML =
            "⧉";

        copyButton.addEventListener(
            "click",
            function () {
                copyMessage(copyButton);
            }
        );

        actions.appendChild(copyButton);

        /*
            Opciones
        */

        const options =
            document.createElement("div");

        options.className =
            "message-options";

        const optionsButton =
            document.createElement("button");

        optionsButton.type = "button";
        optionsButton.className =
            "message-action";

        optionsButton.setAttribute(
            "aria-label",
            "Más opciones"
        );

        optionsButton.title =
            "Más opciones";

        optionsButton.innerHTML =
            "⋯";

        optionsButton.addEventListener(
            "click",
            function (event) {
                event.stopPropagation();

                toggleMessageOptions(
                    optionsButton
                );
            }
        );

        options.appendChild(
            optionsButton
        );

        const menu =
            document.createElement("div");

        menu.className =
            "message-options-menu";

        menu.hidden = true;

        /*
            Reajustar
        */

        const retryButton =
            document.createElement("button");

        retryButton.type = "button";
        retryButton.textContent =
            "Reajustar";

        retryButton.addEventListener(
            "click",
            function () {
                retryMessage(
                    messageElement
                );
            }
        );

        menu.appendChild(
            retryButton
        );

        /*
            Nuevo chat
        */

        const newChatButton =
            document.createElement("button");

        newChatButton.type = "button";

        newChatButton.textContent =
            "Hablar de este tema en nuevo chat";

        newChatButton.addEventListener(
            "click",
            function () {
                newChatFromMessage(
                    messageElement
                );
            }
        );

        menu.appendChild(
            newChatButton
        );

        options.appendChild(menu);
        actions.appendChild(options);

        return actions;
    }

    /*
        =========================================================
        MENSAJE SIMPLE
        =========================================================
    */

    function addMessage(
        text,
        type
    ) {
        const chat = getChat();

        if (!chat) {
            return null;
        }

        const messageElement =
            document.createElement("div");

        messageElement.className =
            "message " +
            (
                type === "user"
                    ? "user"
                    : "ai"
            );

        const bubble =
            document.createElement("div");

        bubble.className =
            "bubble";

        bubble.textContent =
            text == null
                ? ""
                : String(text);

        messageElement.appendChild(
            bubble
        );

        messageElement.appendChild(
            createMessageActions(
                messageElement,
                type
            )
        );

        chat.appendChild(
            messageElement
        );

        scrollToBottom();

        return messageElement;
    }

    /*
        =========================================================
        TAREAS
        =========================================================
    */

    function createTask(task) {
        const taskElement =
            document.createElement("div");

        taskElement.className =
            "ai-task";

        const main =
            document.createElement("div");

        main.className =
            "ai-task-main";

        const title =
            document.createElement("div");

        title.className =
            "ai-task-title";

        title.textContent =
            task.title ||
            "Tarea";

        main.appendChild(title);

        if (
            task.start_time ||
            task.end_time ||
            task.time
        ) {
            const time =
                document.createElement("div");

            time.className =
                "ai-task-time";

            if (task.time) {
                time.textContent =
                    task.time;
            } else if (
                task.start_time &&
                task.end_time
            ) {
                time.textContent =
                    `${task.start_time} - ${task.end_time}`;
            } else {
                time.textContent =
                    task.start_time ||
                    task.end_time ||
                    "";
            }

            main.appendChild(time);
        }

        taskElement.appendChild(main);

        const meta =
            document.createElement("div");

        meta.className =
            "ai-task-meta";

        if (task.priority) {
            const priority =
                document.createElement("span");

            const priorityValue =
                String(
                    task.priority
                ).toLowerCase();

            priority.classList.add(
                "ai-priority-" +
                priorityValue
            );

            priority.textContent =
                String(task.priority);

            meta.appendChild(
                priority
            );
        }

        if (task.category) {
            const category =
                document.createElement("span");

            category.textContent =
                String(task.category);

            meta.appendChild(
                category
            );
        }

        if (
            task.duration_minutes != null
        ) {
            const duration =
                document.createElement("span");

            duration.textContent =
                `${task.duration_minutes} min`;

            meta.appendChild(
                duration
            );
        }

        if (task.status) {
            const status =
                document.createElement("span");

            status.textContent =
                String(task.status);

            meta.appendChild(
                status
            );
        }

        if (meta.children.length > 0) {
            taskElement.appendChild(
                meta
            );
        }

        if (task.description) {
            const description =
                document.createElement("div");

            description.className =
                "ai-response-subtitle";

            description.textContent =
                String(
                    task.description
                );

            taskElement.appendChild(
                description
            );
        }

        return taskElement;
    }

    /*
        =========================================================
        SUGERENCIAS
        =========================================================
    */

    function createSuggestion(
        suggestion
    ) {
        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "ai-suggestion";

        if (
            typeof suggestion ===
            "string"
        ) {
            button.textContent =
                suggestion;

            button.dataset.message =
                suggestion;
        } else {
            const label =
                suggestion.label ||
                suggestion.text ||
                suggestion.message ||
                "";

            button.textContent =
                label;

            button.dataset.message =
                suggestion.message ||
                label;
        }

        button.addEventListener(
            "click",
            function () {
                const message =
                    button.dataset.message ||
                    button.textContent ||
                    "";

                if (
                    typeof window.sendMessage ===
                    "function"
                ) {
                    window.sendMessage(
                        message
                    );
                    return;
                }

                document.dispatchEvent(
                    new CustomEvent(
                        "scarpe:suggestion",
                        {
                            detail: {
                                message
                            }
                        }
                    )
                );
            }
        );

        return button;
    }

    /*
        =========================================================
        RESPUESTA ESTRUCTURADA DE sAI
        =========================================================
    */

    function renderResponse(
        response
    ) {
        const chat = getChat();

        if (!chat) {
            return null;
        }

        const normalized =
            normalizeResponse(
                response
            );

        const messageElement =
            document.createElement("div");

        messageElement.className =
            "message ai";

        const bubble =
            document.createElement("div");

        bubble.className =
            "bubble";

        const responseContainer =
            document.createElement("div");

        responseContainer.className =
            "ai-response";

        /*
            Título
        */

        if (normalized.title) {
            const title =
                document.createElement("div");

            title.className =
                "ai-response-title";

            title.textContent =
                normalized.title;

            responseContainer.appendChild(
                title
            );
        }

        /*
            Subtítulo
        */

        if (normalized.subtitle) {
            const subtitle =
                document.createElement("div");

            subtitle.className =
                "ai-response-subtitle";

            subtitle.textContent =
                normalized.subtitle;

            responseContainer.appendChild(
                subtitle
            );
        }

        /*
            Mensaje principal
        */

        if (
            normalized.message
        ) {
            const message =
                document.createElement("div");

            message.className =
                "ai-response-message";

            message.textContent =
                normalized.message;

            responseContainer.appendChild(
                message
            );
        }

        /*
            Tareas
        */

        if (
            normalized.tasks.length > 0
        ) {
            const tasks =
                document.createElement("div");

            tasks.className =
                "ai-response-tasks";

            normalized.tasks.forEach(
                function (task) {
                    tasks.appendChild(
                        createTask(task)
                    );
                }
            );

            responseContainer.appendChild(
                tasks
            );
        }

        /*
            Sugerencias
        */

        if (
            normalized.suggestions.length > 0
        ) {
            const suggestions =
                document.createElement("div");

            suggestions.className =
                "ai-response-suggestions";

            normalized.suggestions.forEach(
                function (suggestion) {
                    suggestions.appendChild(
                        createSuggestion(
                            suggestion
                        )
                    );
                }
            );

            responseContainer.appendChild(
                suggestions
            );
        }

        bubble.appendChild(
            responseContainer
        );

        messageElement.appendChild(
            bubble
        );

        messageElement.appendChild(
            createMessageActions(
                messageElement,
                "ai"
            )
        );

        chat.appendChild(
            messageElement
        );

        scrollToBottom();

        return messageElement;
    }

    /*
        =========================================================
        INDICADOR DE ESCRITURA
        =========================================================
    */

    function showTyping() {
        const chat = getChat();

        if (!chat) {
            return null;
        }

        const existing =
            document.getElementById(
                "sai-typing"
            );

        if (existing) {
            return existing;
        }

        const messageElement =
            document.createElement("div");

        messageElement.className =
            "message ai";

        messageElement.id =
            "sai-typing";

        const bubble =
            document.createElement("div");

        bubble.className =
            "bubble";

        const typing =
            document.createElement("div");

        typing.className =
            "ai-typing";

        for (
            let index = 0;
            index < 3;
            index++
        ) {
            const dot =
                document.createElement("span");

            typing.appendChild(dot);
        }

        bubble.appendChild(
            typing
        );

        messageElement.appendChild(
            bubble
        );

        chat.appendChild(
            messageElement
        );

        scrollToBottom();

        return messageElement;
    }

    function hideTyping() {
        const typing =
            document.getElementById(
                "sai-typing"
            );

        if (typing) {
            typing.remove();
        }
    }

    /*
        =========================================================
        CHAT VACÍO
        =========================================================
    */

    function clearChat() {
        const chat = getChat();

        if (!chat) {
            return;
        }

        chat.innerHTML = "";
    }

    function showEmptyState(
        title,
        subtitle
    ) {
        const chat = getChat();

        if (!chat) {
            return null;
        }

        clearChat();

        const empty =
            document.createElement("div");

        empty.className =
            "chat-empty";

        const heading =
            document.createElement("div");

        heading.className =
            "chat-empty-title";

        heading.textContent =
            title ||
            "¿Qué vamos a organizar hoy?";

        empty.appendChild(
            heading
        );

        const description =
            document.createElement("div");

        description.className =
            "chat-empty-subtitle";

        description.textContent =
            subtitle ||
            "Cuéntale a sAI qué tienes que hacer y se encargará de organizarlo.";

        empty.appendChild(
            description
        );

        chat.appendChild(
            empty
        );

        return empty;
    }

    /*
        =========================================================
        EVENTOS GLOBALES
        =========================================================
    */

    document.addEventListener(
        "click",
        function (event) {
            if (
                !event.target.closest ||
                !event.target.closest(
                    ".message-options"
                )
            ) {
                closeAllMessageMenus();
            }
        }
    );

    /*
        =========================================================
        API PÚBLICA
        =========================================================
    */

    window.ScarpeChatUI = {
        addMessage,
        renderResponse,
        normalizeResponse,
        createTask,
        createSuggestion,
        showTyping,
        hideTyping,
        clearChat,
        showEmptyState,
        scrollToBottom,
        closeAllMessageMenus
    };

    /*
        Compatibilidad con código existente
    */

    window.addMessage = addMessage;
    window.renderScarpeResponse =
        renderResponse;
    window.renderLifeOSResponse =
        renderResponse;
    window.showChatTyping =
        showTyping;
    window.hideChatTyping =
        hideTyping;
    window.clearChat =
        clearChat;

})();
