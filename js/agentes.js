(() => {
        document.body.dataset.theme = localStorage.getItem("sttu-theme") === "night" ? "night" : "day";
    })();

