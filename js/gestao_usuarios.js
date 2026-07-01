async function iniciarGestaoUsuarios() {
    const {initializeApp, getApp, getApps} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, getDocs, doc, updateDoc, getDoc, serverTimestamp, onSnapshot} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
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

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let unsubscribeUsuarios = null;
    let usuariosCache = [];
    let usuarioSelecionadoId = null;
    let estadoEdicao = null;
    let perfilAtual = "personalizado";
    let alteracoesPendentes = false;
    let usuarioAdminAtual = null;

    function temPermissaoModulo(dadosUsuario, modulo, acao = "habilitado") {
        const cargo = normalizarValor(dadosUsuario?.cargo);
        const nivel = normalizarValor(dadosUsuario?.nivel_acesso);
        if (cargo === "admin" || nivel === "admin") return true;
        const permissaoModulo = dadosUsuario?.permissoes?.[modulo];
        if (!permissaoModulo || typeof permissaoModulo !== "object") return false;
        return permissaoModulo?.[acao] === true
            || permissaoModulo?.[acao] === "true"
            || (acao !== "habilitado" && permissaoModulo?.habilitado === true);
    }

    const modulos = [
        {id: "agentes", nome: "Agentes", pagina: "agentes.html", icone: "U"},
        {id: "ocorrencias", nome: "Ocorrencias", pagina: "ocorrencias.html", icone: "O"},
        {id: "smartwall", nome: "Smartwall", pagina: "smartwall.html", icone: "S"},
        {id: "relatorios", nome: "Relatorios", pagina: "relatorio_geral.html", icone: "R"},
        {id: "observacoes", nome: "Observacoes", pagina: "observacoes.html", icone: "N"},
        {id: "usuarios", nome: "Usuarios", pagina: "admin.html", icone: "C"},
        {id: "permissoes", nome: "Permissoes", pagina: "gestao_usuarios.html", icone: "P"},
        {id: "auditoria", nome: "Auditoria", pagina: "auditoria.html", icone: "A"},
        {id: "estatisticas", nome: "Estatisticas", pagina: "estatisticas.html", icone: "E"}
    ];

    const acoes = [
        {id: "habilitado", nome: "Habilitado"},
        {id: "visualizar", nome: "Visualizar"},
        {id: "criar", nome: "Criar"},
        {id: "editar", nome: "Editar"},
        {id: "excluir", nome: "Excluir"}
    ];

    const perfis = {
        administrador: {
            titulo: "Administrador",
            descricao: "Acesso completo a todas as funcionalidades.",
            cargo: "admin",
            nivel_acesso: "total",
            montar: () => montarPermissoes(true)
        },
        supervisor: {
            titulo: "Supervisor",
            descricao: "Gerencia usuarios e visualiza relatorios.",
            cargo: "agente",
            nivel_acesso: "total",
            montar: () => montarPermissoesPorModulo({
                dashboard: ["habilitado", "visualizar"],
                agentes: ["habilitado", "visualizar", "criar", "editar"],
                ocorrencias: ["habilitado", "visualizar", "criar", "editar", "excluir"],
                smartwall: ["habilitado", "visualizar"],
                relatorios: ["habilitado", "visualizar"],
                observacoes: ["habilitado", "visualizar", "criar", "editar"],
                usuarios: ["habilitado", "visualizar", "editar", "excluir"],
                estatisticas: ["habilitado", "visualizar"]
            })
        },
        operador: {
            titulo: "Operador",
            descricao: "Pode criar e gerenciar registros operacionais.",
            cargo: "agente",
            nivel_acesso: "total",
            montar: () => montarPermissoesPorModulo({
                dashboard: ["habilitado", "visualizar"],
                agentes: ["habilitado", "visualizar"],
                ocorrencias: ["habilitado", "visualizar", "criar", "editar"],
                smartwall: ["habilitado", "visualizar"],
                observacoes: ["habilitado", "visualizar", "criar", "editar"]
            })
        },
        leitura: {
            titulo: "Somente leitura",
            descricao: "Acesso limitado apenas para visualizacao.",
            cargo: "visualizador",
            nivel_acesso: "leitura",
            montar: () => montarPermissoesPorModulo({
                dashboard: ["habilitado", "visualizar"],
                agentes: ["habilitado", "visualizar"],
                ocorrencias: ["habilitado", "visualizar"],
                smartwall: ["habilitado", "visualizar"],
                relatorios: ["habilitado", "visualizar"],
                observacoes: ["habilitado", "visualizar"]
            })
        }
    };

    document.getElementById("buscaUsuarios")?.addEventListener("input", () => carregarUsuarios(usuariosCache));
    document.getElementById("filtroUsuarios")?.addEventListener("change", () => carregarUsuarios(usuariosCache));
    document.getElementById("btnCancelarAlteracoes")?.addEventListener("click", cancelarAlteracoes);
    document.getElementById("btnSalvarAlteracoes")?.addEventListener("click", salvarAlteracoes);
    document.getElementById("btnSair")?.addEventListener("click", () => {
        if (confirm("Deseja realmente sair?")) {
            marcarUsuarioOffline(auth.currentUser?.uid).finally(() => {
                signOut(auth).then(() => window.location.href = "login.html");
            });
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists() || !temPermissaoModulo(docSnap.data(), "permissoes")) {
            alert("ACESSO NEGADO: Voce nao tem permissao para gerenciar usuarios.");
            window.location.href = "index.html";
            return;
        }

        usuarioAdminAtual = {id: user.uid, ...docSnap.data()};
        const nomeDisplay = document.getElementById("nomeUsuarioDisplay");
        if (nomeDisplay) nomeDisplay.textContent = `Ola, ${usuarioAdminAtual.nome || user.email || "Administrador"}`;
        iniciarMonitorUsuarios();
    });

    function iniciarMonitorUsuarios() {
        if (unsubscribeUsuarios) return;
        unsubscribeUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
            carregarUsuarios(snapshot);
        }, (error) => {
            console.error("Erro ao monitorar usuarios:", error);
            alert("Erro ao monitorar usuarios: " + error.message);
        });
    }

    async function carregarUsuarios(snapshotUsuarios = null) {
        const lista = document.getElementById("listaUsuarios");
        const querySnapshot = snapshotUsuarios || await getDocs(collection(db, "usuarios"));
        const usuarios = [];

        if (typeof querySnapshot.forEach === "function") {
            querySnapshot.forEach((docUser) => usuarios.push({id: docUser.id, ...docUser.data()}));
        } else if (Array.isArray(querySnapshot)) {
            usuarios.push(...querySnapshot);
        }

        usuariosCache = usuarios;
        atualizarResumo(usuarios);

        const usuariosVisiveis = filtrarUsuarios(ordenarUsuarios(usuarios));
        lista.innerHTML = "";

        if (!usuariosVisiveis.length) {
            lista.innerHTML = `<div class="empty-state">Nenhum usuario encontrado.</div>`;
            renderizarDetalhe(null);
            return;
        }

        if (!usuarioSelecionadoId || !usuariosVisiveis.some((usuario) => usuario.id === usuarioSelecionadoId)) {
            usuarioSelecionadoId = usuariosVisiveis[0].id;
            estadoEdicao = null;
        }

        usuariosVisiveis.forEach((dados) => {
            const conexao = obterConexaoUsuario(dados);
            const item = document.createElement("button");
            item.type = "button";
            item.className = `user-item${dados.id === usuarioSelecionadoId ? " is-active" : ""}`;
            item.dataset.usuarioId = dados.id;
            item.onclick = () => selecionarUsuario(dados.id);
            item.innerHTML = `
                <span class="avatar"><img src="${obterAvatarCargo(dados.cargo)}" alt=""></span>
                <span>
                    <span class="user-name">${escapeHtml(dados.nome || "---")}</span>
                    <span class="user-role">${escapeHtml(obterRotuloCargo(dados.cargo))}</span>
                </span>
                <span>
                    <span class="user-matricula">${escapeHtml(dados.matricula || "---")}</span>
                    <span class="connection-dot ${conexao.online ? "online" : "offline"}">${conexao.online ? "Online" : "Offline"}</span>
                </span>
            `;
            lista.appendChild(item);
        });

        renderizarDetalhe(obterUsuarioSelecionado());
    }

    function filtrarUsuarios(usuarios) {
        const termo = normalizarValor(document.getElementById("buscaUsuarios")?.value);
        const filtro = normalizarValor(document.getElementById("filtroUsuarios")?.value || "todos");

        return usuarios.filter((usuario) => {
            const cargo = normalizarValor(usuario.cargo || "agente");
            const conexao = obterConexaoUsuario(usuario);
            const texto = normalizarValor(`${usuario.nome || ""} ${usuario.matricula || ""} ${usuario.cargo || ""}`);
            const passaTermo = !termo || texto.includes(termo);
            const passaFiltro = filtro === "todos"
                || cargo === filtro
                || (filtro === "online" && conexao.online)
                || (filtro === "offline" && !conexao.online);
            return passaTermo && passaFiltro;
        });
    }

    function selecionarUsuario(id) {
        if (alteracoesPendentes && !confirm("Existem alteracoes nao salvas. Deseja descartar e trocar de usuario?")) return;
        const usuario = usuariosCache.find((item) => item.id === id);
        if (!usuario) return;

        usuarioSelecionadoId = id;
        estadoEdicao = null;
        marcarAlteracoes(false);
        document.querySelectorAll("#listaUsuarios .user-item").forEach((item) => {
            item.classList.toggle("is-active", item.dataset.usuarioId === id);
        });
        renderizarDetalhe(usuario);
    }

    function renderizarDetalhe(usuario) {
        const card = document.getElementById("usuarioSelecionadoCard");
        const matriz = document.getElementById("matrizPermissoes");
        if (!usuario) {
            card.innerHTML = `<div class="empty-state">Selecione um usuario para configurar as permissoes.</div>`;
            matriz.innerHTML = "";
            return;
        }

        if (!estadoEdicao || estadoEdicao.id !== usuario.id) {
            estadoEdicao = criarEstadoEdicao(usuario);
            perfilAtual = detectarPerfil(estadoEdicao);
            marcarAlteracoes(false);
        }

        const conexao = obterConexaoUsuario(usuario);
        const statusAtual = obterStatusUsuario(estadoEdicao) === "ativo" ? "ativo" : "desativado";
        card.innerHTML = `
            <div class="selected-user-grid">
                <div class="selected-user-main">
                    <span class="avatar"><img src="${obterAvatarCargo(estadoEdicao.cargo)}" alt=""></span>
                    <div>
                        <h3>${escapeHtml(estadoEdicao.nome || "---")}</h3>
                        <p>Matricula: ${escapeHtml(estadoEdicao.matricula || "---")}</p>
                        <p>E-mail: ${escapeHtml(estadoEdicao.email || estadoEdicao.e_mail || "---")}</p>
                    </div>
                </div>
                <div class="selected-user-metric">
                    <span class="detail-label">Cargo</span>
                    <span class="cargo-pill cargo-${escapeHtml(estadoEdicao.cargo || "agente")}">${escapeHtml(obterRotuloCargo(estadoEdicao.cargo))}</span>
                </div>
                <div class="selected-user-metric">
                    <span class="detail-label">Status</span>
                    <span class="status-pill ${statusAtual}">${statusAtual === "ativo" ? "Ativo" : "Desativado"}</span>
                </div>
                <div class="selected-user-metric">
                    <span class="detail-label">Conexao</span>
                    <span class="connection-pill ${conexao.online ? "online" : "offline"}">${conexao.online ? "Online" : "Offline"}</span>
                    <span class="last-access">Entrada: ${conexao.ultimoAcesso}</span>
                    <span class="last-access">Saida: ${conexao.ultimaSaida}</span>
                </div>
                <div class="selected-user-actions">
                    <button type="button" class="btn-outline" onclick="mostrarDetalhesUsuario('${usuario.id}')">Dados</button>
                </div>
            </div>
            <div class="profile-row">
                <strong>Perfil do usuario</strong>
                ${["admin", "agente", "ciosp", "visualizador"].map((cargo) => `
                    <label class="role-option ${cargo} ${estadoEdicao.cargo === cargo ? "is-selected" : ""}">
                        <input type="radio" name="cargoUsuario" value="${cargo}" ${estadoEdicao.cargo === cargo ? "checked" : ""}>
                        <span>${obterRotuloCargo(cargo)}</span>
                    </label>
                `).join("")}
                <label class="role-option ${statusAtual === "ativo" ? "agente is-selected" : ""}">
                    <input type="checkbox" id="statusUsuarioSelecionado" ${statusAtual === "ativo" ? "checked" : ""}>
                    <span>Acesso ativo</span>
                </label>
            </div>
        `;

        card.querySelectorAll("input[name='cargoUsuario']").forEach((input) => {
            input.addEventListener("change", () => {
                estadoEdicao.cargo = input.value;
                if (input.value === "visualizador") estadoEdicao.nivel_acesso = "leitura";
                if (input.value === "admin") estadoEdicao.nivel_acesso = "total";
                perfilAtual = "personalizado";
                marcarAlteracoes(true);
                renderizarDetalhe(usuario);
            });
        });

        card.querySelector("#statusUsuarioSelecionado")?.addEventListener("change", (event) => {
            const ativo = event.target.checked;
            estadoEdicao.status = ativo ? "aprovado" : "desativado";
            estadoEdicao.ativo = ativo;
            estadoEdicao.aprovado = ativo;
            marcarAlteracoes(true);
            renderizarDetalhe(usuario);
        });

        renderizarMatriz();
    }

    function renderizarMatriz() {
        const matriz = document.getElementById("matrizPermissoes");
        if (!estadoEdicao) {
            matriz.innerHTML = "";
            return;
        }

        matriz.innerHTML = `
            <table class="permission-table">
                <thead>
                    <tr>
                        <th>Modulo</th>
                        ${acoes.map((acao) => `<th>${acao.nome}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${modulos.map((modulo) => `
                        <tr>
                            <td><span class="module-name">${modulo.nome}</span></td>
                            ${acoes.map((acao) => {
                                const permissaoModulo = estadoEdicao.permissoes?.[modulo.id] || {};
                                const checked = permissaoModulo?.[acao.id] === true;
                                const moduloHabilitado = permissaoModulo?.habilitado === true;
                                const podeVisualizar = permissaoModulo?.visualizar === true;
                                const disabled = acao.id !== "habilitado" && (!moduloHabilitado || (acao.id !== "visualizar" && !podeVisualizar));
                                return `<td><input class="permission-check" type="checkbox" data-modulo="${modulo.id}" data-acao="${acao.id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}></td>`;
                            }).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        matriz.querySelectorAll(".permission-check").forEach((input) => {
            input.addEventListener("change", () => {
                const modulo = input.dataset.modulo;
                const acao = input.dataset.acao;
                estadoEdicao.permissoes[modulo][acao] = input.checked;

                if (acao === "habilitado" && !input.checked) {
                    acoes.forEach((item) => estadoEdicao.permissoes[modulo][item.id] = false);
                }

                if (acao === "habilitado" && input.checked) {
                    acoes.forEach((item) => estadoEdicao.permissoes[modulo][item.id] = true);
                }

                if (acao === "visualizar" && !input.checked) {
                    acoes
                        .filter((item) => !["habilitado", "visualizar"].includes(item.id))
                        .forEach((item) => estadoEdicao.permissoes[modulo][item.id] = false);
                }

                if (!["habilitado", "visualizar"].includes(acao) && input.checked) {
                    estadoEdicao.permissoes[modulo].habilitado = true;
                    estadoEdicao.permissoes[modulo].visualizar = true;
                }

                estadoEdicao.nivel_acesso = calcularNivelAcesso(estadoEdicao.permissoes);
                perfilAtual = "personalizado";
                marcarAlteracoes(true);
                renderizarMatriz();
            });
        });
    }

    async function salvarAlteracoes() {
        if (!estadoEdicao) return;
        const botao = document.getElementById("btnSalvarAlteracoes");
        botao.disabled = true;

        const statusAtivo = obterStatusUsuario(estadoEdicao) === "ativo";
        const atualizacao = {
            cargo: estadoEdicao.cargo || "agente",
            nivel_acesso: estadoEdicao.nivel_acesso || calcularNivelAcesso(estadoEdicao.permissoes),
            permissoes: estadoEdicao.permissoes,
            perfil_permissao: perfilAtual,
            status: statusAtivo ? "aprovado" : "desativado",
            ativo: statusAtivo,
            aprovado: statusAtivo,
            permissoesAtualizadasEm: serverTimestamp()
        };

        if (!statusAtivo) {
            atualizacao.online = false;
            atualizacao.ultimaSaida = serverTimestamp();
            atualizacao.bloqueadoEm = serverTimestamp();
        } else {
            atualizacao.desbloqueadoEm = serverTimestamp();
        }

        try {
            await updateDoc(doc(db, "usuarios", estadoEdicao.id), atualizacao);
            marcarAlteracoes(false);
            await carregarUsuarios();
            alert("Alteracoes salvas com sucesso.");
        } catch (error) {
            alert("Erro ao salvar alteracoes: " + error.message);
        } finally {
            botao.disabled = !alteracoesPendentes;
        }
    }

    function cancelarAlteracoes() {
        if (!usuarioSelecionadoId) return;
        estadoEdicao = null;
        marcarAlteracoes(false);
        renderizarDetalhe(obterUsuarioSelecionado());
    }

    function criarEstadoEdicao(usuario) {
        return {
            ...usuario,
            cargo: normalizarValor(usuario.cargo || "agente") || "agente",
            nivel_acesso: usuario.nivel_acesso || "total",
            permissoes: normalizarPermissoes(usuario)
        };
    }

    function normalizarPermissoes(usuario) {
        const existentes = usuario.permissoes && typeof usuario.permissoes === "object" ? usuario.permissoes : null;
        const base = existentes ? montarPermissoes(false) : permissoesPorLegado(usuario);

        if (existentes) {
            modulos.forEach((modulo) => {
                const permissaoExistente = existentes?.[modulo.id];
                const possuiHabilitadoExplicito = permissaoExistente
                    && Object.prototype.hasOwnProperty.call(permissaoExistente, "habilitado");
                acoes.forEach((acao) => {
                    const valorExistente = permissaoExistente?.[acao.id];
                    base[modulo.id][acao.id] = valorExistente === true;
                    if (acao.id === "habilitado" && !possuiHabilitadoExplicito) {
                        base[modulo.id].habilitado = permissaoExistente?.visualizar === true;
                    }
                });
                const possuiAcao = acoes.some((acao) => !["habilitado", "visualizar"].includes(acao.id) && base[modulo.id][acao.id]);
                if (!possuiHabilitadoExplicito && base[modulo.id].visualizar) base[modulo.id].habilitado = true;
                if (possuiAcao) base[modulo.id].visualizar = true;
                if (possuiAcao) base[modulo.id].habilitado = true;
            });
        }

        return base;
    }

    function permissoesPorLegado(usuario) {
        const cargo = normalizarValor(usuario.cargo);
        const nivel = normalizarValor(usuario.nivel_acesso);
        if (cargo === "admin" || nivel === "admin") return montarPermissoes(true);
        if (cargo === "ciosp" || cargo === "cir") return montarPermissoesPorModulo({ocorrencias: ["visualizar"]});
        if (cargo === "visualizador" || nivel === "leitura") return perfis.leitura.montar();
        return perfis.operador.montar();
    }

    function montarPermissoes(valor) {
        return modulos.reduce((acc, modulo) => {
            acc[modulo.id] = acoes.reduce((acoesAcc, acao) => {
                acoesAcc[acao.id] = valor === true;
                return acoesAcc;
            }, {});
            return acc;
        }, {});
    }

    function montarPermissoesPorModulo(config) {
        const permissoes = montarPermissoes(false);
        Object.entries(config).forEach(([modulo, listaAcoes]) => {
            if (!permissoes[modulo]) return;
            listaAcoes.forEach((acao) => {
                if (permissoes[modulo][acao] !== undefined) permissoes[modulo][acao] = true;
            });
        });
        return permissoes;
    }

    function calcularNivelAcesso(permissoes) {
        const possuiEdicao = modulos.some((modulo) => ["criar", "editar", "excluir"].some((acao) => permissoes?.[modulo.id]?.[acao]));
        return possuiEdicao ? "total" : "leitura";
    }

    function detectarPerfil(estado) {
        const encontrado = Object.entries(perfis).find(([, perfil]) => {
            return normalizarValor(estado.cargo) === perfil.cargo
                && normalizarValor(estado.nivel_acesso) === perfil.nivel_acesso
                && permissoesIguais(estado.permissoes, perfil.montar());
        });

        if (encontrado) return encontrado[0];
        return "personalizado";
    }

    function permissoesIguais(a, b) {
        return modulos.every((modulo) => {
            return acoes.every((acao) => (a?.[modulo.id]?.[acao.id] === true) === (b?.[modulo.id]?.[acao.id] === true));
        });
    }

    function obterUsuarioSelecionado() {
        return usuariosCache.find((usuario) => usuario.id === usuarioSelecionadoId) || null;
    }

    function atualizarResumo(usuarios) {
        const total = usuarios.length;
        const totalOnline = usuarios.filter((usuario) => obterConexaoUsuario(usuario).online).length;
        const totalOffline = total - totalOnline;
        const totalAcesso = usuarios.filter((usuario) => normalizarValor(usuario.nivel_acesso) === "total" || normalizarValor(usuario.cargo) === "admin").length;
        const totalLeitura = usuarios.filter((usuario) => normalizarValor(usuario.nivel_acesso) === "leitura" || normalizarValor(usuario.cargo) === "visualizador").length;
        const totalPersonalizado = Math.max(total - totalAcesso - totalLeitura, 0);
        const cargos = usuarios.reduce((acc, usuario) => {
            const cargo = obterRotuloCargo(usuario.cargo).toUpperCase();
            acc[cargo] = (acc[cargo] || 0) + 1;
            return acc;
        }, {});

        document.getElementById("totalUsuarios").textContent = `Total: ${total}`;
        document.getElementById("distribuicaoCargos").textContent = Object.entries(cargos)
            .map(([cargo, qtd]) => `${cargo}: ${qtd}`)
            .join(" | ") || "Sem dados";
        document.getElementById("resumoPermissoes").textContent = `Acesso total: ${totalAcesso} | Leitura: ${totalLeitura} | Personalizado: ${totalPersonalizado}`;
        document.getElementById("resumoConexoes").textContent = `Online: ${totalOnline} | Offline: ${totalOffline}`;

        const graus = total ? Math.round((totalAcesso / total) * 360) : 0;
        document.getElementById("graficoPermissoes").style.background =
            `conic-gradient(#16a34a 0deg ${graus}deg, #94a3b8 ${graus}deg 360deg)`;
    }

    function contarPermissoes(usuario, valor) {
        const permissoes = normalizarPermissoes(usuario);
        return modulos.reduce((acc, modulo) => {
            return acc + acoes.filter((acao) => permissoes?.[modulo.id]?.[acao.id] === valor).length;
        }, 0);
    }

    function marcarAlteracoes(valor) {
        alteracoesPendentes = valor;
        const status = document.getElementById("statusAlteracoes");
        const salvar = document.getElementById("btnSalvarAlteracoes");
        const cancelar = document.getElementById("btnCancelarAlteracoes");
        if (status) {
            status.textContent = valor ? "Alteracoes pendentes" : "Sem alteracoes pendentes";
            status.classList.toggle("has-changes", valor);
        }
        if (salvar) salvar.disabled = !valor;
        if (cancelar) cancelar.disabled = !valor;
    }

    function ordenarUsuarios(usuarios) {
        return [...usuarios].sort((a, b) => {
            const conexaoA = obterReferenciaConexao(a);
            const conexaoB = obterReferenciaConexao(b);
            if (conexaoA !== conexaoB) return conexaoB - conexaoA;
            return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
        });
    }

    function obterAvatarCargo(cargo) {
        const mapa = {
            agente: "src/agente_avatar.png",
            admin: "src/admin_avatar.png",
            ciosp: "src/ciosp_avatar.png",
            cir: "src/cir_avatar.png",
            visualizador: "src/visualizador_avatar.png"
        };
        return mapa[normalizarValor(cargo)] || mapa.agente;
    }

    function obterRotuloCargo(cargo) {
        const mapa = {admin: "Admin", agente: "Agente", ciosp: "CIOSP", cir: "CIR", visualizador: "Visualizador"};
        return mapa[normalizarValor(cargo)] || "Agente";
    }

    function normalizarValor(valor) {
        return String(valor || "").trim().toLowerCase();
    }

    function obterStatusUsuario(dadosUsuario) {
        if (!dadosUsuario) return "desativado";
        const status = normalizarValor(dadosUsuario.status);
        const aprovado = normalizarValor(dadosUsuario.aprovado);
        if (dadosUsuario.ativo === true) return "ativo";
        if (status === "ativo" || status === "aprovado") return "ativo";
        if (status === "desativado") return "desativado";
        if (status === "pendente") return "pendente";
        if (dadosUsuario.aprovado === true || aprovado === "true" || aprovado === "aprovado") return "ativo";
        return "pendente";
    }

    function obterData(valor) {
        if (!valor) return null;
        let data = null;
        if (typeof valor?.toDate === "function") data = valor.toDate();
        else if (typeof valor?.seconds === "number") data = new Date(valor.seconds * 1000);
        else if (typeof valor === "number") data = new Date(valor);
        else if (typeof valor === "string") data = new Date(valor);
        if (!data || Number.isNaN(data.getTime())) return null;
        return data;
    }

    function formatarDataHora(valor) {
        const data = obterData(valor);
        if (!data) return "---";
        return data.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function obterReferenciaConexao(dadosUsuario) {
        const acesso = obterData(dadosUsuario?.ultimoAcesso || dadosUsuario?.lastLogin || dadosUsuario?.lastSeen);
        const saida = obterData(dadosUsuario?.ultimaSaida || dadosUsuario?.lastLogout);
        return Math.max(acesso?.getTime() || 0, saida?.getTime() || 0);
    }

    function obterConexaoUsuario(dadosUsuario) {
        const ultimoValor = dadosUsuario?.ultimoAcesso || dadosUsuario?.lastLogin || dadosUsuario?.lastSeen;
        const saidaValor = dadosUsuario?.ultimaSaida || dadosUsuario?.lastLogout;
        const ultimoAcessoData = obterData(ultimoValor);
        const acessoRecente = ultimoAcessoData ? (Date.now() - ultimoAcessoData.getTime()) <= (2 * 60 * 1000) : false;
        const onlineMarcado = dadosUsuario?.online === true;
        const offlineMarcado = dadosUsuario?.online === false;
        return {
            online: onlineMarcado && (acessoRecente || !ultimoAcessoData) && !offlineMarcado,
            ultimoAcesso: formatarDataHora(ultimoValor),
            ultimaSaida: formatarDataHora(saidaValor)
        };
    }

    async function marcarUsuarioOffline(uid) {
        if (!uid) return;
        try {
            await updateDoc(doc(db, "usuarios", uid), {
                online: false,
                ultimaSaida: serverTimestamp()
            });
        } catch (error) {
            console.warn("Nao foi possivel marcar usuario offline:", error);
        }
    }

    function escapeHtml(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#039;"
        }[char]));
    }

    window.duplicarPerfilUsuario = async (id) => {
        const origem = usuariosCache.find((usuario) => usuario.id === id);
        if (!origem) return;
        const destinoMatricula = prompt("Informe a matricula do usuario que recebera este perfil:");
        if (!destinoMatricula) return;
        const destino = usuariosCache.find((usuario) => String(usuario.matricula || "").trim() === destinoMatricula.trim());
        if (!destino) {
            alert("Usuario de destino nao encontrado.");
            return;
        }
        if (!confirm(`Duplicar permissoes de ${origem.nome || "usuario"} para ${destino.nome || "usuario"}?`)) return;

        try {
            await updateDoc(doc(db, "usuarios", destino.id), {
                cargo: origem.cargo || "agente",
                nivel_acesso: origem.nivel_acesso || "total",
                permissoes: normalizarPermissoes(origem),
                perfil_permissao: origem.perfil_permissao || "personalizado",
                permissoesAtualizadasEm: serverTimestamp()
            });
            alert("Perfil duplicado com sucesso.");
        } catch (error) {
            alert("Erro ao duplicar perfil: " + error.message);
        }
    };

    window.mostrarDetalhesUsuario = async (id) => {
        try {
            const usuarioSnap = await getDoc(doc(db, "usuarios", id));
            if (!usuarioSnap.exists()) {
                alert("Usuario nao encontrado.");
                return;
            }

            const dados = usuarioSnap.data();
            alert([
                `Nome: ${dados.nome || "---"}`,
                `Matricula: ${dados.matricula || "---"}`,
                `Cargo: ${dados.cargo || "---"}`,
                `Status: ${dados.status || "---"}`,
                `Nivel: ${dados.nivel_acesso || "---"}`
            ].join("\n"));
        } catch (error) {
            alert("Erro ao carregar dados do usuario: " + error.message);
        }
    };
}

iniciarGestaoUsuarios().catch((error) => {
    console.error("Erro ao carregar gestao_usuarios:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexao e atualize a pagina.");
});
