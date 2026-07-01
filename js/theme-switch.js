(() => {
    const themeKey = "sttu-theme";
    const getSavedTheme = () => localStorage.getItem(themeKey) === "night" ? "night" : "day";

    const applyTheme = (theme) => {
        const normalizedTheme = theme === "night" ? "night" : "day";
        document.body.dataset.theme = normalizedTheme;

        const button = document.getElementById("themeSwitch");
        if (button) {
            button.setAttribute("aria-pressed", normalizedTheme === "night" ? "true" : "false");
            button.setAttribute("title", normalizedTheme === "night" ? "Modo noite" : "Modo dia");
        }

        window.dispatchEvent(new CustomEvent("sttu-theme-change", { detail: { theme: normalizedTheme } }));
    };

    const initThemeSwitch = () => {
        applyTheme(getSavedTheme());

        const button = document.getElementById("themeSwitch");
        if (!button || button.dataset.themeReady === "true") return;

        button.dataset.themeReady = "true";
        button.addEventListener("click", () => {
            const nextTheme = document.body.dataset.theme === "night" ? "day" : "night";
            localStorage.setItem(themeKey, nextTheme);
            applyTheme(nextTheme);
        });
    };

    const prepararCorretorTextarea = (root = document) => {
        const textareas = root.matches?.("textarea")
            ? [root]
            : Array.from(root.querySelectorAll?.("textarea") || []);

        textareas.forEach((textarea) => {
            textarea.setAttribute("spellcheck", "true");
            textarea.setAttribute("lang", textarea.getAttribute("lang") || "pt-BR");
            textarea.setAttribute("autocorrect", "on");
            textarea.setAttribute("autocapitalize", "sentences");
        });
    };

    const initCorretorTextarea = () => {
        prepararCorretorTextarea();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        prepararCorretorTextarea(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) {
        initThemeSwitch();
        initCorretorTextarea();
    } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initThemeSwitch();
            initCorretorTextarea();
        });
    } else {
        initThemeSwitch();
        initCorretorTextarea();
    }
})();
