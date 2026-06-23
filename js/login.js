(() => {
            const key = "sttu-theme";
            const applyTheme = (theme) => {
                const normalizedTheme = theme === "night" ? "night" : "day";
                document.body.dataset.theme = normalizedTheme;
                const button = document.getElementById("themeSwitch");
                if (button) {
                    button.setAttribute("aria-pressed", normalizedTheme === "night" ? "true" : "false");
                    button.setAttribute("title", normalizedTheme === "night" ? "Modo noite" : "Modo dia");
                }
            };

            applyTheme(localStorage.getItem(key) || "day");

            document.getElementById("themeSwitch")?.addEventListener("click", () => {
                const nextTheme = document.body.dataset.theme === "night" ? "day" : "night";
                localStorage.setItem(key, nextTheme);
                applyTheme(nextTheme);
            });
        })();

