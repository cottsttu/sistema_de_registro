(() => {
    document.body.dataset.theme = localStorage.getItem("sttu-theme") === "night" ? "night" : "day";
    const roleCache = localStorage.getItem("sttu-index-role");
    if (roleCache && roleCache !== "admin") {
        document.body.classList.add("non-admin-panel");
    }
})();

(() => {
    const painel = document.querySelector(".panel-shell");
    const botaoMenu = document.getElementById("mobileMenuToggle");
    if (!painel || !botaoMenu) return;

    botaoMenu.addEventListener("click", () => {
        const aberto = painel.classList.toggle("mobile-menu-open");
        botaoMenu.setAttribute("aria-expanded", aberto ? "true" : "false");
    });
})();

async function iniciarIndex() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const { getAuth, onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
    const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");

    const firebaseConfig = {
        apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
        authDomain: "sttu-registros.firebaseapp.com",
        projectId: "sttu-registros",
        storageBucket: "sttu-registros.firebasestorage.app",
        messagingSenderId: "785219239564",
        appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
        measurementId: "G-C7PSE7YFRG"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    function normalizarValor(valor) {
        return String(valor || "").trim().toLowerCase();
    }

    function obterStatusUsuario(dadosUsuario) {
        if (!dadosUsuario) return "desativado";

        const status = normalizarValor(dadosUsuario.status);
        const aprovado = normalizarValor(dadosUsuario.aprovado);

        if (dadosUsuario.ativo === true) return "ativo";
        if (status === "desativado") return "desativado";
        if (status === "pendente") return "pendente";
        if (status === "ativo" || status === "aprovado") return "ativo";
        if (dadosUsuario.aprovado === true || aprovado === "true" || aprovado === "aprovado") return "ativo";

        return "pendente";
    }

    function mostrarUsuarioLogado(nomeUsuario) {
        const topbar = document.querySelector(".topbar");
        topbar.innerHTML = `
            <div class="user-info">
                <span>Olá, <b>${nomeUsuario}</b></span>
                <button id="btnLogout" class="btn-logout">SAIR</button>
            </div>
        `;

        document.getElementById("btnLogout").onclick = () => {
            if (confirm("Deseja realmente sair?")) {
                localStorage.removeItem("sttu-index-admin-cache");
                localStorage.removeItem("sttu-index-role");
                signOut(auth).then(() => window.location.href = "login.html");
            }
        };
    }

    const cardsPorPagina = {
        "agentes.html": "btnAgentes",
        "ocorrencias.html": "btnOcorrencias",
        "relatorio_geral.html": "btnRelatorios",
        "observacoes.html": "btnObservacoes",
        "admin.html": "btnAprovacao",
        "gestao_usuarios.html": "btnGestao",
        "auditoria.html": "btnAuditoria",
        "estatisticas.html": "btnEstatisticas"
    };

    function obterPaginasPermitidas(cargo, nivel) {
        const isAdmin = cargo.includes("admin") || nivel === "admin";

        if (isAdmin) {
            return new Set(Object.keys(cardsPorPagina));
        }

        if (cargo === "ciosp" || cargo === "cir") {
            return new Set(["ocorrencias.html"]);
        }

        if (cargo === "visualizador" || nivel === "leitura") {
            return new Set(["agentes.html", "ocorrencias.html"]);
        }

        return new Set(["agentes.html", "ocorrencias.html", "observacoes.html"]);
    }

    function aplicarCartoesPermitidos(paginasPermitidas) {
        Object.values(cardsPorPagina).forEach((id) => {
            document.getElementById(id)?.classList.add("hidden");
        });

        paginasPermitidas.forEach((pagina) => {
            document.getElementById(cardsPorPagina[pagina])?.classList.remove("hidden");
        });

        const hrAdmin = document.getElementById("hrAdmin");
        const temAdminCards = ["admin.html", "gestao_usuarios.html", "auditoria.html", "estatisticas.html"]
            .some((pagina) => paginasPermitidas.has(pagina));
        if (hrAdmin) hrAdmin.classList.toggle("hidden", !temAdminCards);

        const painel = document.querySelector(".panel-shell");
        const cardsVisiveis = document.querySelectorAll(".menu-card:not(.hidden)").length;
        if (painel) painel.dataset.visibleCards = String(cardsVisiveis);
    }

    function liberarTelaIndex() {
        document.documentElement.classList.remove("theme-booting");
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            localStorage.removeItem("sttu-index-admin-cache");
            localStorage.removeItem("sttu-index-role");
            window.location.href = "login.html";
            return;
        }

        try {
            const docRef = doc(db, "usuarios", user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                alert("Usuário não encontrado.");
                await signOut(auth);
                window.location.href = "login.html";
                return;
            }

            const dados = docSnap.data();
            const cargo = normalizarValor(dados.cargo);
            const nivel = normalizarValor(dados.nivel_acesso);
            const status = obterStatusUsuario(dados);
            const isAdmin = cargo.includes("admin") || nivel === "admin";
            const paginasPermitidas = obterPaginasPermitidas(cargo, nivel);

            if (status === "desativado") {
                alert("Usuário não autorizado.");
                await signOut(auth);
                window.location.href = "login.html";
                return;
            }

            if (status === "pendente" && !isAdmin) {
                alert("Cadastro pendente para aprovação.");
                await signOut(auth);
                window.location.href = "login.html";
                return;
            }

            mostrarUsuarioLogado(dados.nome || user.email);

            if (isAdmin) {
                localStorage.setItem("sttu-index-admin-cache", "true");
                localStorage.setItem("sttu-index-role", "admin");
                document.documentElement.dataset.indexRole = "admin";
                document.body.classList.add("admin-cache");
                document.body.classList.remove("non-admin-panel");
            } else {
                localStorage.removeItem("sttu-index-admin-cache");
                document.body.classList.remove("admin-cache");
                document.body.classList.add("non-admin-panel");
            }

            aplicarCartoesPermitidos(paginasPermitidas);

            const isVisualizador = (cargo === "visualizador" || nivel === "leitura") && !isAdmin;
            if (isVisualizador) {
                localStorage.setItem("sttu-index-role", "visualizador");
                document.documentElement.dataset.indexRole = "visualizador";
                document.querySelectorAll(".badge-vis").forEach(el => el.style.display = "inline-block");
                document.getElementById("msgBoasVindas").innerText = "Modo de Visualização (Smartwall).";

                const btnOcorrencias = document.getElementById("btnOcorrencias");
                btnOcorrencias.href = "smartwall.html";
                btnOcorrencias.querySelector(".menu-title").innerText = "Smartwall";
            }

            if (cargo === "ciosp") {
                localStorage.setItem("sttu-index-role", "ciosp");
                document.documentElement.dataset.indexRole = "ciosp";
                document.querySelector("h1").innerText = "Painel CIOSP";
            }

            if (cargo === "cir") {
                localStorage.setItem("sttu-index-role", "ciosp");
                document.documentElement.dataset.indexRole = "ciosp";
                document.querySelector("h1").innerText = "Painel CIR";
            }

            if (!isAdmin && !isVisualizador && cargo !== "ciosp" && cargo !== "cir") {
                localStorage.setItem("sttu-index-role", "non-admin");
                document.documentElement.dataset.indexRole = "non-admin";
            }

            liberarTelaIndex();

            if (!isVisualizador) {
                let tempoInatividade;
                const limiteTempo = 15 * 60 * 1000;

                const resetarTimer = () => {
                    clearTimeout(tempoInatividade);
                    tempoInatividade = setTimeout(() => {
                        alert("Sessão encerrada por inatividade (15min).");
                        signOut(auth).then(() => window.location.href = "login.html");
                    }, limiteTempo);
                };

                window.onload = resetarTimer;
                document.onmousemove = resetarTimer;
                document.onkeypress = resetarTimer;
                document.onclick = resetarTimer;
                document.onscroll = resetarTimer;
            }
        } catch (error) {
            console.error(error);
            liberarTelaIndex();
            alert("Erro ao carregar permissões do usuário.");
        }
    });
}

iniciarIndex().catch((error) => {
    console.error("Erro ao carregar a página inicial:", error);
    document.documentElement.classList.remove("theme-booting");
    alert("Erro ao carregar a página inicial. Verifique a conexão e atualize a página.");
});
