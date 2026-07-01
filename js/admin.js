async function iniciarAdmin() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, doc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, setDoc} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
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
    const atualizarCredenciaisUsuarioUrl = "https://us-central1-sttu-registros.cloudfunctions.net/atualizarCredenciaisUsuarioHttp";
    const gerenciarAgenteCondutorUrl = "https://us-central1-sttu-registros.cloudfunctions.net/gerenciarAgenteCondutorHttp";
    const listarAgentesCondutoresUrl = "https://us-central1-sttu-registros.cloudfunctions.net/listarAgentesCondutoresHttp";
    let matriculaSelecionadaOriginal = "";
    const uidPreSelecionado = new URLSearchParams(window.location.search).get("uid");
    let preSelecaoAplicada = false;
    let usuariosCache = [];
    let agentesAdminCache = [];

    function temPermissaoModulo(dadosUsuario, modulo, acao = "habilitado") {
        const cargo = String(dadosUsuario?.cargo || "").toLowerCase();
        const nivel = String(dadosUsuario?.nivel_acesso || "").toLowerCase();
        if (cargo === "admin" || nivel === "admin") return true;
        const permissaoModulo = dadosUsuario?.permissoes?.[modulo];
        if (!permissaoModulo || typeof permissaoModulo !== "object") return false;
        return permissaoModulo?.[acao] === true
            || permissaoModulo?.[acao] === "true"
            || (acao !== "habilitado" && permissaoModulo?.habilitado === true);
    }

    document.getElementById('btnSair')?.addEventListener('click', () => {
        if (confirm("Deseja realmente sair?")) {
            signOut(auth).then(() => window.location.href = "login.html");
        }
    });

    document.getElementById('btnNovoUsuario')?.addEventListener('click', () => {
        limparFormulario();
        document.getElementById('nomeUser').focus();
    });

    document.getElementById('btnLimparEditor')?.addEventListener('click', limparFormulario);

    document.getElementById('btnToggleSenhaAdmin')?.addEventListener('click', () => {
        const inputSenha = document.getElementById('senhaUser');
        const botaoSenha = document.getElementById('btnToggleSenhaAdmin');
        const exibir = inputSenha.type === 'password';
        inputSenha.type = exibir ? 'text' : 'password';
        botaoSenha.setAttribute('aria-label', exibir ? 'Ocultar senha' : 'Exibir senha');
    });

    document.getElementById('buscaUsuarios')?.addEventListener('input', renderizarUsuarios);
    document.getElementById('btnOrdenarUsuarios')?.addEventListener('click', () => {
        usuariosCache.reverse();
        renderizarUsuarios();
    });
    document.getElementById('btnFiltrarUsuarios')?.addEventListener('click', () => {
        const termo = prompt("Filtrar por cargo (agente, admin, ciosp, cir, visualizador):", "");
        if (termo === null) return;
        document.getElementById('buscaUsuarios').value = termo.trim();
        renderizarUsuarios();
    });

    document.getElementById('buscaAgentesAdmin')?.addEventListener('input', renderizarAgentesAdmin);
    document.getElementById('btnLimparAgenteAdmin')?.addEventListener('click', limparFormularioAgenteAdmin);
    document.getElementById('btnImportarAgentesLocais')?.addEventListener('click', async () => {
        const agentes = Array.isArray(window.STTU_AGENTES_PADRAO) ? window.STTU_AGENTES_PADRAO : [];
        if (!agentes.length) {
            alert("Lista local não encontrada.");
            return;
        }

        if (!confirm(`Importar ${agentes.length} agentes/condutores locais para o banco de dados?\n\nDepois disso, a página de agentes usará a lista do banco como lista principal.`)) return;

        try {
            await gerenciarAgenteCondutor({ acao: "importar", agentes });
            await carregarAgentesDoServidor();
            alert("Lista local importada para o banco com sucesso.");
        } catch (error) {
            alert("Erro ao importar lista local: " + error.message);
        }
    });
    document.getElementById('agenteAdminNome')?.addEventListener('input', (event) => {
        const campo = event.target;
        const inicio = campo.selectionStart;
        const fim = campo.selectionEnd;
        const valorMaiusculo = campo.value.toUpperCase();

        if (campo.value !== valorMaiusculo) {
            campo.value = valorMaiusculo;
            campo.setSelectionRange(inicio, fim);
        }
    });
    document.getElementById('agenteAdminMatricula')?.addEventListener('input', (event) => {
        event.target.value = formatarMatriculaAgente(event.target.value);
    });
    document.getElementById('formAgenteAdmin')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = document.getElementById('agenteAdminId').value.trim();
        const nomeAgente = document.getElementById('agenteAdminNome').value.trim().toUpperCase();
        const matriculaAgente = document.getElementById('agenteAdminMatricula').value.trim();

        if (!nomeAgente) {
            alert("Informe o nome do agente/condutor.");
            return;
        }

        if (!/^\d{2}\.\d{3}-\d$/.test(matriculaAgente)) {
            alert("Informe a matrícula no formato xx.xxx-x.");
            return;
        }

        const nome = `${nomeAgente} - ${matriculaAgente}`;

        try {
            const docId = id || gerarIdAgente(nome);
            await gerenciarAgenteCondutor({ acao: "salvar", id: docId, nome });
            atualizarAgenteNoCache(docId, nome);
            await carregarAgentesDoServidor();
            limparFormularioAgenteAdmin();
            alert("Agente salvo com sucesso.");
        } catch (error) {
            alert("Erro ao salvar agente: " + error.message);
        }
    });

    async function atualizarCredenciaisUsuario(dados) {
        const user = auth.currentUser;
        if (!user) throw new Error("Sessão expirada. Faça login novamente.");

        const token = await user.getIdToken(true);
        const resposta = await fetch(atualizarCredenciaisUsuarioUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(dados)
        });

        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !resultado.ok) {
            throw new Error(resultado.message || `Erro HTTP ${resposta.status}`);
        }
        return resultado;
    }

    async function gerenciarAgenteCondutor(dados) {
        const user = auth.currentUser;
        if (!user) throw new Error("Sessão expirada. Faça login novamente.");

        const token = await user.getIdToken(true);
        const resposta = await fetch(gerenciarAgenteCondutorUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(dados)
        });

        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !resultado.ok) {
            throw new Error(resultado.message || `Erro HTTP ${resposta.status}`);
        }
        return resultado;
    }

    async function listarAgentesCondutores() {
        const user = auth.currentUser;
        if (!user) throw new Error("Sessão expirada. Faça login novamente.");

        const token = await user.getIdToken(true);
        const resposta = await fetch(listarAgentesCondutoresUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !resultado.ok) {
            throw new Error(resultado.message || `Erro HTTP ${resposta.status}`);
        }
        return resultado.agentes || [];
    }

    async function carregarAgentesDoServidor() {
        try {
            const agentes = await listarAgentesCondutores();
            if (!agentes.length) {
                carregarAgentesPadraoNoPainel();
                return;
            }

            agentesAdminCache = agentes.map((agente) => ({
                id: agente.id,
                nome: String(agente.nome || "").trim().toUpperCase(),
                origem: "firebase"
            })).filter((agente) => agente.nome);

            agentesAdminCache.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
            renderizarAgentesAdmin();
        } catch (error) {
            console.error("Erro ao listar agentes/condutores:", error);
            if (!agentesAdminCache.length) carregarAgentesPadraoNoPainel();
        }
    }

    // --- SEGURANÇA ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);
                
                if (!docSnap.exists() || !temPermissaoModulo(docSnap.data(), "usuarios")) {
                    alert("ACESSO NEGADO.");
                    window.location.href = "index.html";
                    return;
                }

                carregarAgentesDoServidor();
            } catch (e) { console.error(e); }
        } else {
            window.location.href = "login.html";
        }
    });

    // --- MONITORAR CONTADOR GLOBAL ---
    onSnapshot(doc(db, "config", "contador"), (docSnap) => {
        const display = document.getElementById('displayContadorGlobal');
        if (docSnap.exists()) {
            display.innerText = docSnap.data().atual;
        } else {
            display.innerText = "0 (Não iniciado)";
        }
    });

    // --- FUNÇÃO PARA ZERAR TUDO (CONTADOR GLOBAL) ---
    document.getElementById('btnZerarContador').onclick = async () => {
        if(confirm("⚠️ ATENÇÃO ⚠️\n\nIsso reiniciará a contagem das ocorrências para 001.\n\nDeseja realmente continuar?")) {
            try {
                await setDoc(doc(db, "config", "contador"), { atual: 0 });
                alert("✅ Contador reiniciado com sucesso!");
            } catch (e) {
                alert("Erro ao zerar: " + e.message);
            }
        }
    };

    // --- FUNÇÃO PARA DEFINIR CONTADOR MANUALMENTE ---
    document.getElementById('btnDefinirContador').onclick = async () => {
        const valorInput = document.getElementById('inputNovoContador').value;
        const valorNumerico = parseInt(valorInput);

        if (!valorInput || isNaN(valorNumerico) || valorNumerico < 0) {
            return alert("Número inválido.");
        }

        if(confirm(`CONFIRMAÇÃO:\n\nVocê vai definir o contador para ${valorNumerico}.\nIsso significa que a PRÓXIMA ocorrência será a número ${valorNumerico + 1}.\n\nDeseja aplicar?`)) {
            try {
                await setDoc(doc(db, "config", "contador"), { atual: valorNumerico });
                alert(`✅ Contador ajustado!`);
                document.getElementById('inputNovoContador').value = "";
            } catch (e) {
                alert("Erro ao definir: " + e.message);
            }
        }
    };

    // --- FUNÇÃO SALVAR DADOS DE USUÁRIO ---
    document.getElementById('btnSalvar').onclick = async () => {
        const uid = document.getElementById('uidUser').value.trim();
        const nome = document.getElementById('nomeUser').value.trim().toUpperCase();
        const mat = document.getElementById('matUser').value.trim();
        const senha = document.getElementById('senhaUser').value;
        const cargo = document.getElementById('cargoUser').value;

        const criandoNovoUsuario = !uid;

        if (!nome || !mat) return alert("Informe nome completo e usuário/matrícula.");
        if (criandoNovoUsuario && !senha) return alert("Informe uma senha inicial para criar o novo usuário.");
        if (senha && senha.length < 6) return alert("A nova senha precisa ter no mínimo 6 caracteres.");

        try {
            const alterouLoginOuSenha = criandoNovoUsuario || mat !== matriculaSelecionadaOriginal || senha.length > 0;
            if (alterouLoginOuSenha) {
                const resultadoCredenciais = await atualizarCredenciaisUsuario({
                    uid,
                    nome,
                    matricula: mat,
                    cargo,
                    senha: senha || null
                });
                if (criandoNovoUsuario && resultadoCredenciais?.uid) {
                    document.getElementById('uidUser').value = resultadoCredenciais.uid;
                }
            } else {
                await updateDoc(doc(db, "usuarios", uid), { nome, matricula: mat, cargo });
            }
            alert("✅ Dados atualizados!");
            limparFormulario();
        } catch (error) {
            if (error.code === "functions/not-found") {
                alert("A função de administração ainda não foi publicada no Firebase. Publique a Cloud Function para alterar login e senha.");
            } else {
                const detalhes = error.details?.message || error.details || error.message || error.code || "Erro desconhecido.";
                alert("Erro ao atualizar login/senha: " + detalhes);
            }
        }
    };

    // --- FUNÇÃO EXCLUIR USUÁRIO ---
    document.getElementById('btnExcluir').onclick = async () => {
        const uid = document.getElementById('uidUser').value.trim();
        if (!uid) return alert("Selecione um usuário na lista primeiro.");
        
        if (confirm("Tem certeza que deseja EXCLUIR este usuário?")) {
            try {
                await deleteDoc(doc(db, "usuarios", uid));
                alert("🗑️ Usuário removido!");
                limparFormulario();
            } catch (error) {
                alert("Erro ao excluir: " + error.message);
            }
        }
    };

    function limparFormulario() {
        document.getElementById('uidUser').value = "";
        document.getElementById('nomeUser').value = "";
        document.getElementById('matUser').value = "";
        document.getElementById('senhaUser').value = "";
        document.getElementById('cargoUser').value = "agente";
        matriculaSelecionadaOriginal = "";
    }

    function preencherFormularioUsuario(uid, data) {
        document.getElementById('uidUser').value = uid;
        document.getElementById('nomeUser').value = data.nome || "";
        document.getElementById('matUser').value = data.matricula || "";
        document.getElementById('senhaUser').value = "";
        document.getElementById('cargoUser').value = data.cargo || "agente";
        matriculaSelecionadaOriginal = data.matricula || "";
    }

    function obterUsuarioCache(uid) {
        return usuariosCache.find((usuario) => usuario.uid === uid);
    }

    function focarEditor() {
        document.querySelector('.editor-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('nomeUser')?.focus();
    }

    function obterAvatarCargo(cargo) {
        const cargoNormalizado = String(cargo || "agente").toLowerCase();
        const mapa = {
            admin: "src/admin_avatar.png",
            agente: "src/agente_avatar.png",
            ciosp: "src/ciosp_avatar.png",
            cir: "src/cir_avatar.png",
            visualizador: "src/visualizador_avatar.png"
        };

        return mapa[cargoNormalizado] || mapa.agente;
    }

    function obterClasseCargo(cargo) {
        const cargoNormalizado = String(cargo || "agente").toLowerCase();
        if (cargoNormalizado === "admin") return "bg-admin";
        if (cargoNormalizado === "visualizador") return "bg-visualizador";
        if (cargoNormalizado === "ciosp") return "bg-ciosp";
        if (cargoNormalizado === "cir") return "bg-cir";
        return "bg-agente";
    }

    function gerarIdAgente(nome) {
        return String(nome || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 120) || `agente_${Date.now()}`;
    }

    async function sincronizarAgentesPadrao() {
        const listaPadrao = Array.isArray(window.STTU_AGENTES_PADRAO) ? window.STTU_AGENTES_PADRAO : [];
        await Promise.all(listaPadrao.map((nome) => {
            const nomeFinal = String(nome || "").trim().toUpperCase();
            if (!nomeFinal) return Promise.resolve();
            return setDoc(doc(db, "agentes_condutores", gerarIdAgente(nomeFinal)), { nome: nomeFinal }, { merge: true });
        }));
    }

    function limparFormularioAgenteAdmin() {
        document.getElementById('agenteAdminId').value = "";
        document.getElementById('agenteAdminNome').value = "";
        document.getElementById('agenteAdminMatricula').value = "";
    }

    function formatarMatriculaAgente(valor) {
        const numeros = String(valor || "").replace(/\D/g, "").slice(0, 6);
        if (numeros.length <= 2) return numeros;
        if (numeros.length <= 5) return `${numeros.slice(0, 2)}.${numeros.slice(2)}`;
        return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}-${numeros.slice(5)}`;
    }

    function separarNomeMatriculaAgente(valor) {
        const texto = String(valor || "").trim();
        const match = texto.match(/^(.*?)\s*-\s*(\d{2}\.\d{3}-\d)$/);
        if (!match) return { nome: texto, matricula: "" };

        return {
            nome: match[1].trim(),
            matricula: match[2].trim()
        };
    }

    function atualizarAgenteNoCache(id, nome) {
        const nomeFinal = String(nome || "").trim().toUpperCase();
        const index = agentesAdminCache.findIndex((agente) => agente.id === id);

        if (index >= 0) {
            agentesAdminCache[index] = { ...agentesAdminCache[index], nome: nomeFinal, origem: "firebase" };
        } else {
            agentesAdminCache.push({ id, nome: nomeFinal, origem: "firebase" });
        }

        agentesAdminCache.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        renderizarAgentesAdmin();
    }

    function renderizarAgentesAdmin() {
        const tbody = document.getElementById('listaAgentesAdmin');
        if (!tbody) return;

        const busca = String(document.getElementById('buscaAgentesAdmin')?.value || "").trim().toLowerCase();
        const lista = agentesAdminCache.filter((agente) => !busca || agente.nome.toLowerCase().includes(busca));
        document.getElementById('totalAgentesAdmin').textContent = `Total: ${lista.length}`;

        if (!lista.length) {
            tbody.innerHTML = `<tr><td colspan="3" class="empty-row">Nenhum agente encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map((agente) => `
            <tr>
                <td>${agente.nome}</td>
                <td><span class="origin-badge ${agente.origem}">${agente.origem === "firebase" ? "Banco" : "Padrão"}</span></td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="agent-edit-button" data-agent-action="edit" data-agent-id="${agente.id}" title="Editar agente">Editar nome</button>
                        <button type="button" class="row-action delete" data-agent-action="delete" data-agent-id="${agente.id}" title="Excluir agente">🗑</button>
                    </div>
                </td>
            </tr>
        `).join("");
    }

    document.getElementById('listaAgentesAdmin')?.addEventListener('click', async (event) => {
        const botao = event.target.closest('[data-agent-action]');
        if (!botao) return;

        const agente = agentesAdminCache.find((item) => item.id === botao.dataset.agentId);
        if (!agente) return;

        if (botao.dataset.agentAction === "edit") {
            const partes = separarNomeMatriculaAgente(agente.nome);
            document.getElementById('agenteAdminId').value = agente.id;
            document.getElementById('agenteAdminNome').value = partes.nome;
            document.getElementById('agenteAdminMatricula').value = partes.matricula;
            document.getElementById('agenteAdminNome').focus();
            return;
        }

        if (botao.dataset.agentAction === "delete") {
            if (!confirm(`Tem certeza que deseja excluir este agente/condutor?\n\n${agente.nome}\n\nEssa ação remove o nome da listagem usada na página de agentes.`)) return;

            if (agente.origem !== "firebase") {
                agentesAdminCache = agentesAdminCache.filter((item) => item.id !== agente.id);
                renderizarAgentesAdmin();
                limparFormularioAgenteAdmin();
                alert("Agente removido da lista exibida. Para gravar alterações permanentes, é necessário ter permissão no banco.");
                return;
            }

            try {
                await gerenciarAgenteCondutor({ acao: "excluir", id: agente.id });
                agentesAdminCache = agentesAdminCache.filter((item) => item.id !== agente.id);
                renderizarAgentesAdmin();
                await carregarAgentesDoServidor();
                limparFormularioAgenteAdmin();
                alert("Agente excluído com sucesso.");
            } catch (error) {
                alert("Erro ao excluir agente: " + error.message);
            }
        }
    });

    function carregarAgentesPadraoNoPainel() {
        const listaPadrao = Array.isArray(window.STTU_AGENTES_PADRAO) ? window.STTU_AGENTES_PADRAO : [];
        agentesAdminCache = listaPadrao.map((nome) => ({
            id: gerarIdAgente(nome),
            nome: String(nome || "").trim().toUpperCase(),
            origem: "padrao"
        })).filter((agente) => agente.nome);

        agentesAdminCache.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        renderizarAgentesAdmin();
    }

    function renderizarUsuarios() {
        const lista = document.getElementById('listaUsuarios');
        lista.innerHTML = "";
        const busca = String(document.getElementById('buscaUsuarios')?.value || "").trim().toLowerCase();
        const usuariosFiltrados = usuariosCache.filter(({ uid, data }) => {
            const texto = [
                uid,
                data.nome,
                data.matricula,
                data.email,
                data.cargo,
                data.status
            ].join(" ").toLowerCase();
            return !busca || texto.includes(busca);
        });

        if (!usuariosFiltrados.length) {
            lista.innerHTML = `<tr><td colspan="4" class="empty-row">Nenhum usuário encontrado.</td></tr>`;
            return;
        }

        usuariosFiltrados.forEach(({ uid, data }) => {
            const nome = data.nome || "SEM NOME";
            const matricula = data.matricula || "S/M";
            const cargo = data.cargo || "agente";
            const tr = document.createElement('tr');
            tr.dataset.uid = uid;
            if (data.status === "pendente") tr.classList.add("pendente");
            if (uidPreSelecionado === uid) tr.classList.add("selecionado");

            tr.innerHTML = `
                <td>
                    <div class="user-identity">
                        <span class="avatar-cargo"><img src="${obterAvatarCargo(cargo)}" alt=""></span>
                        <div>
                            <span class="user-name-main">${nome}</span>
                            <span class="user-id-small">UID: ${uid}</span>
                        </div>
                    </div>
                </td>
                <td>${matricula}</td>
                <td><span class="permission-badge ${obterClasseCargo(cargo)}">${cargo.toUpperCase()}</span></td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="row-action edit" data-action="edit" data-uid="${uid}" title="Editar usuário">✎</button>
                        <button type="button" class="row-action delete" data-action="delete" data-uid="${uid}" title="Excluir usuário">🗑</button>
                        <button type="button" class="row-action more" data-action="more" data-uid="${uid}" title="Detalhes do usuário">⋯</button>
                        ${data.status === "pendente" ? `<button type="button" class="row-action approve" data-action="approve" data-uid="${uid}" title="Aprovar usuário">✓</button>` : ''}
                    </div>
                </td>
            `;

            tr.addEventListener('dblclick', () => preencherFormularioUsuario(uid, data));

            lista.appendChild(tr);
        });
    }

    document.getElementById('listaUsuarios')?.addEventListener('click', async (event) => {
        const botaoAcao = event.target.closest('.row-action');
        if (!botaoAcao) return;

        event.stopPropagation();
        const uid = botaoAcao.dataset.uid;
        const usuario = obterUsuarioCache(uid);
        if (!usuario) return alert("Usuário não encontrado na lista.");

        const { data } = usuario;
        const nome = data.nome || "SEM NOME";
        const matricula = data.matricula || "S/M";
        const cargo = data.cargo || "agente";
        const acao = botaoAcao.dataset.action;

        if (acao === "edit") {
            preencherFormularioUsuario(uid, data);
            focarEditor();
            return;
        }

        if (acao === "delete") {
            const confirmar = confirm(`Tem certeza que deseja excluir o usuário?\n\nNome: ${nome}\nMatrícula: ${matricula}\n\nEssa ação remove o cadastro deste usuário.`);
            if (!confirmar) return;

            try {
                await deleteDoc(doc(db, "usuarios", uid));
                if (document.getElementById('uidUser').value.trim() === uid) {
                    limparFormulario();
                }
                alert("Usuário removido!");
            } catch (error) {
                alert("Erro ao excluir: " + error.message);
            }
            return;
        }

        if (acao === "more") {
            alert(`UID: ${uid}\nNome: ${nome}\nMatrícula: ${matricula}\nCargo: ${cargo.toUpperCase()}\nStatus: ${data.status || "---"}`);
            return;
        }

        if (acao === "approve") {
            window.aprovarUsuario(uid);
        }
    });

    // --- LISTA DE USUÁRIOS ---
    onSnapshot(collection(db, "usuarios"), (snapshot) => {
        usuariosCache = [];

        snapshot.forEach((docSnap) => {
            usuariosCache.push({ uid: docSnap.id, data: docSnap.data() });
        });

        usuariosCache.sort((a, b) => String(a.data.nome || "").localeCompare(String(b.data.nome || ""), "pt-BR"));
        renderizarUsuarios();

        if (uidPreSelecionado && !preSelecaoAplicada) {
            const usuarioSelecionado = usuariosCache.find((usuario) => usuario.uid === uidPreSelecionado);
            if (usuarioSelecionado) {
                preencherFormularioUsuario(uidPreSelecionado, usuarioSelecionado.data);
                preSelecaoAplicada = true;
            } else {
                getDoc(doc(db, "usuarios", uidPreSelecionado)).then((usuarioSnap) => {
                    if (!usuarioSnap.exists()) return;
                    preencherFormularioUsuario(uidPreSelecionado, usuarioSnap.data());
                    preSelecaoAplicada = true;
                });
            }
        }
    });

    carregarAgentesPadraoNoPainel();

    window.aprovarUsuario = async (uid) => {
        if(confirm("Confirma a aprovação?")) {
            await updateDoc(doc(db, "usuarios", uid), {
                status: "aprovado",
                ativo: true,
                aprovado: true
            });
            alert("Usuário Aprovado!");
        }
    };
}

iniciarAdmin().catch((error) => {
    console.error("Erro ao carregar admin:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


