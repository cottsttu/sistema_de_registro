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

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThemeSwitch);
    } else {
        initThemeSwitch();
    }
})();
