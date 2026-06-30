(() => {
    const menu = document.querySelector('.app-shortcut-menu');
    if (!menu || menu.dataset.ready === 'true') return;

    menu.dataset.ready = 'true';
    menu.style.visibility = 'hidden';

    const firebaseConfig = {
        apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
        authDomain: "sttu-registros.firebaseapp.com",
        projectId: "sttu-registros",
        storageBucket: "sttu-registros.firebasestorage.app",
        messagingSenderId: "785219239564",
        appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
        measurementId: "G-C7PSE7YFRG"
    };

    const adminPages = new Set([
        'admin.html',
        'auditoria.html',
        'estatisticas.html',
        'gestao_usuarios.html',
        'relatorio_geral.html',
        'smartwall.html'
    ]);

    const defaultPages = new Set([
        'agentes.html',
        'ocorrencias.html',
        'observacoes.html'
    ]);

    const pageLabels = {
        'agentes.html': 'Agentes',
        'ocorrencias.html': 'Ocorrências',
        'relatorio_geral.html': 'Relatórios',
        'observacoes.html': 'Observações',
        'gestao_usuarios.html': 'Cadastros',
        'admin.html': 'Permissões',
        'auditoria.html': 'Auditoria',
        'estatisticas.html': 'Estatísticas',
        'smartwall.html': 'Smartwall'
    };

    const menuOrder = [
        'agentes.html',
        'ocorrencias.html',
        'smartwall.html',
        'relatorio_geral.html',
        'observacoes.html',
        'gestao_usuarios.html',
        'admin.html',
        'auditoria.html',
        'estatisticas.html'
    ];

    const getCurrentFile = () => (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const normalize = (value) => String(value || '').trim().toLowerCase();

    function getAllowedPages(userData) {
        const cargo = normalize(userData?.cargo);
        const nivel = normalize(userData?.nivel_acesso);
        const isAdmin = cargo.includes('admin') || nivel === 'admin';

        if (isAdmin) {
            return new Set([...defaultPages, ...adminPages]);
        }

        if (cargo === 'ciosp' || cargo === 'cir') {
            return new Set(['ocorrencias.html']);
        }

        if (cargo === 'visualizador' || nivel === 'leitura') {
            return new Set(['agentes.html', 'ocorrencias.html', 'smartwall.html']);
        }

        return new Set(defaultPages);
    }

    function atualizarUsuarioMenu(userData, user) {
        const nome = userData?.nome || user?.email || "Usu\u00e1rio";
        const texto = `Ol\u00e1, ${nome}`;
        const displayExistente = document.getElementById('nomeUsuarioDisplay');

        if (displayExistente) {
            const atual = String(displayExistente.textContent || "").trim();
            if (!atual || atual === "Carregando..." || atual === "...") {
                displayExistente.textContent = texto;
            }
            return;
        }

        let display = menu.querySelector('.app-user-display');
        if (!display) {
            display = document.createElement('span');
            display.className = 'app-user-display';
            const logoutButton = menu.querySelector('.app-logout-button');
            if (logoutButton) {
                menu.insertBefore(display, logoutButton);
            } else {
                menu.appendChild(display);
            }
        }

        display.textContent = texto;
    }

    function filterMenu(allowedPages) {
        const currentFile = getCurrentFile();
        const dropdown = menu.querySelector('.app-menu-dropdown');

        if (dropdown) {
            allowedPages.forEach((page) => {
                if (page === currentFile || dropdown.querySelector(`[data-page="${page}"]`)) return;
                const link = document.createElement('a');
                link.href = page;
                link.dataset.page = page;
                link.className = 'app-menu-link';
                link.textContent = pageLabels[page] || page;
                dropdown.appendChild(link);
            });
        }

        menu.querySelectorAll('[data-page]').forEach((link) => {
            const page = normalize(link.getAttribute('data-page'));
            if (page === currentFile || !allowedPages.has(page)) {
                link.remove();
            }
        });

        if (dropdown) {
            const orderedLinks = [...dropdown.querySelectorAll('.app-menu-link')].sort((a, b) => {
                const pageA = normalize(a.getAttribute('data-page'));
                const pageB = normalize(b.getAttribute('data-page'));
                return menuOrder.indexOf(pageA) - menuOrder.indexOf(pageB);
            });
            orderedLinks.forEach((link) => dropdown.appendChild(link));
        }

        if (currentFile === 'index.html') {
            menu.querySelector('.app-home-shortcut')?.remove();
        }

        if (!menu.querySelector('.app-menu-link')) {
            menu.querySelector('.app-menu-toggle')?.remove();
            menu.querySelector('.app-menu-dropdown')?.remove();
        }

        menu.style.visibility = '';
    }

    async function loadAllowedPages() {
        try {
            const [{ initializeApp, getApp, getApps }, { getAuth, onAuthStateChanged, signOut }, { getFirestore, doc, getDoc, updateDoc, serverTimestamp, onSnapshot }] = await Promise.all([
                import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"),
                import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js")
            ]);

            const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const db = getFirestore(app);
            const user = await new Promise((resolve) => {
                let unsubscribe = () => {};
                unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                    unsubscribe();
                    resolve(currentUser);
                });
            });

            if (!user) return defaultPages;

            const userSnap = await getDoc(doc(db, "usuarios", user.uid));
            const userData = userSnap.exists() ? userSnap.data() : null;
            const userRef = doc(db, "usuarios", user.uid);
            let encerrandoSessao = false;
            let presencaInterval = null;
            const usuarioDesativado = (dados) => {
                const status = normalize(dados?.status);
                const aprovado = normalize(dados?.aprovado);
                return dados?.ativo === false || status === 'desativado' || dados?.aprovado === false || aprovado === 'false';
            };
            const marcarOnline = () => updateDoc(userRef, {
                online: true,
                ultimoAcesso: serverTimestamp()
            }).catch((error) => console.warn("N\u00e3o foi poss\u00edvel atualizar presen\u00e7a:", error));
            const marcarOffline = () => updateDoc(userRef, {
                online: false,
                ultimaSaida: serverTimestamp()
            }).catch((error) => console.warn("N\u00e3o foi poss\u00edvel encerrar presen\u00e7a:", error));

            const encerrarPorBloqueio = async () => {
                if (encerrandoSessao) return;
                encerrandoSessao = true;
                if (presencaInterval) clearInterval(presencaInterval);
                alert("Usu\u00e1rio n\u00e3o autorizado. Sua sess\u00e3o foi encerrada pelo administrador.");
                await marcarOffline();
                await signOut(auth);
                window.location.href = "login.html";
            };

            if (usuarioDesativado(userData)) {
                await encerrarPorBloqueio();
                return defaultPages;
            }
            marcarOnline();
            presencaInterval = setInterval(() => {
                if (!encerrandoSessao) marcarOnline();
            }, 60000);
            onSnapshot(userRef, (snapshot) => {
                if (!snapshot.exists() || usuarioDesativado(snapshot.data())) {
                    encerrarPorBloqueio();
                }
            }, (error) => console.warn("N\u00e3o foi poss\u00edvel monitorar acesso do usu\u00e1rio:", error));
            document.getElementById('btnSair')?.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!confirm("Deseja realmente sair?")) return;
                encerrandoSessao = true;
                if (presencaInterval) clearInterval(presencaInterval);
                await marcarOffline();
                await signOut(auth);
                window.location.href = "login.html";
            }, { capture: true });
            atualizarUsuarioMenu(userData, user);
            return getAllowedPages(userData);
        } catch (error) {
            console.error("Erro ao filtrar menu:", error);
            return defaultPages;
        }
    }

    const toggle = menu.querySelector('.app-menu-toggle');

    toggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target)) {
            menu.classList.remove('open');
            toggle?.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            menu.classList.remove('open');
            toggle?.setAttribute('aria-expanded', 'false');
        }
    });

    loadAllowedPages().then(filterMenu);
})();
