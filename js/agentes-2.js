async function iniciarAgentes2() {
    const {initializeApp, getApp, getApps} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, addDoc, serverTimestamp, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, where, getDoc} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");// --- CONFIGURAÇÃO ---
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

    function temPermissaoAdministrativaModulo(dadosUsuario, modulo) {
        return ["editar", "excluir"].some((acao) => temPermissaoModulo(dadosUsuario, modulo, acao));
    }

    async function marcarOffline(uid = auth.currentUser?.uid) {
        if (!uid) return;
        try {
            await updateDoc(doc(db, "usuarios", uid), {
                online: false,
                ultimaSaida: serverTimestamp()
            });
        } catch (error) {
            console.warn("Não foi possível marcar usuário offline:", error);
        }
    }

    let veiculosEmUso = new Set();
    let agentesEmUso = new Set();
    let nomeUsuarioLogado = "ANÔNIMO"; 
    let usuarioEhAdmin = false; 
    let isVisualizador = false;
    const listarAgentesCondutoresUrl = "https://us-central1-sttu-registros.cloudfunctions.net/listarAgentesCondutoresHttp";
    
    // Armazena os dados do histórico para renderizar novamente quando o login confirmar que é admin
    let listaHistoricoCache = []; 
    let listaAtivosCache = [];

    // --- SEGURANÇA + TIMER DE 15 MIN ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const dados = docSnap.data();
                    
                    // NOME
                    nomeUsuarioLogado = dados.nome || "Usuário";
                    
                    // 1. DEFINE SE É ADMIN
                    const cargoUsuario = String(dados.cargo || "").toLowerCase();
                    const nivelAcesso = String(dados.nivel_acesso || "").toLowerCase();
                    usuarioEhAdmin = temPermissaoAdministrativaModulo(dados, "agentes"); 
                    
                    document.getElementById('nomeUsuarioDisplay').innerText = "Olá, " + nomeUsuarioLogado + (usuarioEhAdmin ? " (ADMIN)" : "");

                    // 2. FORÇA A ATUALIZAÇÃO DA TABELA (Para aparecer o botão de excluir)
                    renderizarTabelaHistorico();
                    renderizarTabelaAtivos();

                    // --- REGRA GERAL: SÓ ADMIN BAIXA CSV E VÊ PDF ---
                    if (!usuarioEhAdmin) {
                        const btnCsv = document.getElementById('btnCSV');
                        if (btnCsv) btnCsv.style.display = 'none';

                        const btnRel = document.getElementById('btnNavRelatorios');
                        if (btnRel) btnRel.style.display = 'none';
                    }

                    // --- BLOQUEIO PARA VISUALIZADOR (ESTRATÉGIA NUCLEAR) ---
                    if (cargoUsuario === 'visualizador' || nivelAcesso === 'leitura') {
                        isVisualizador = true;
                        console.log("🔒 Modo Apenas Leitura Ativado");

                        // 1. DESTRUIR ÁREA DE REGISTRO
                        const areaRegistro = document.getElementById('areaRegistro');
                        if (areaRegistro) areaRegistro.remove();

                        // 2. INJETAR CSS PARA ESCONDER AÇÕES NA TABELA
                        const styleBlock = document.createElement('style');
                        styleBlock.innerHTML = `
                            .col-acao, .btn-acao-tabela, .btn-encaminhar, .btn-devolver, .btn-confirmar {
                                display: none !important;
                            }
                            table th:last-child, table td:last-child {
                                display: none !important;
                            }
                        `;
                        document.head.appendChild(styleBlock);

                        // 3. OCULTAR BOTÕES DE NAVEGAÇÃO PROIBIDOS
                        const btnObs = document.getElementById('btnNavObservacoes');
                        if (btnObs) btnObs.style.display = 'none';
                        
                        window.devolverVeiculo = () => alert("Acesso Negado.");
                    } else {
                        isVisualizador = false;
                    }
                    
                    if (cargoUsuario !== 'visualizador') {
                        let tempoInatividade;
                        const LIMITE_TEMPO = 15 * 60 * 1000; 
                        const resetarTimer = () => {
                            clearTimeout(tempoInatividade);
                            tempoInatividade = setTimeout(() => {
                                alert("⚠️ Sessão encerrada por inatividade (15min).");
                                marcarOffline(user.uid).finally(() => {
                                    signOut(auth).then(() => window.location.href = "login.html");
                                });
                            }, LIMITE_TEMPO);
                        };
                        window.onload = resetarTimer; document.onmousemove = resetarTimer; document.onkeypress = resetarTimer; document.onclick = resetarTimer; document.onscroll = resetarTimer;
                    }

                    carregarAgentesDoServidor();
                } else {
                    alert("Erro de cadastro. Contate o suporte.");
                    await signOut(auth);
                    window.location.href = "login.html";
                }
            } catch (error) { console.error("Erro:", error); }
        } else {
            window.location.href = "login.html";
        }
    });

    const btnSair = document.getElementById('btnSair');
    if(btnSair) {
        btnSair.onclick = () => {
            marcarOffline().finally(() => {
                signOut(auth).then(() => { window.location.href = "login.html"; });
            });
        }
    }

    let agentesDB = [...(window.STTU_AGENTES_PADRAO || [])];
    let agentesDatalistDisponiveis = [];
    
    const form = document.getElementById('registroForm');
    const tabelaAtivos = document.getElementById('tabelaAtivos').getElementsByTagName('tbody')[0];
    const relatorioFinalTbody = document.getElementById('relatorioFinal').getElementsByTagName('tbody')[0];

    function atualizarDataEHora() {
        const dataAtual = new Date();
        const diasSemana = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
        const dia = String(dataAtual.getDate()).padStart(2, '0');
        const mes = String(dataAtual.getMonth() + 1).padStart(2, '0');
        const ano = dataAtual.getFullYear();
        const dataFormatada = `${dia}/${mes}/${ano}`;
        document.getElementById('diaSemana').textContent = `${diasSemana[dataAtual.getDay()]} - ${dataFormatada}`;
        document.getElementById('dataRelatorio').value = dataFormatada;
        return dataFormatada;
    }

    function preencherHoraAtualSeVazio() {
        const horaInicio = document.getElementById('horaInicio');
        if (!horaInicio || horaInicio.value) return;
        horaInicio.value = getHoraAtualComSegundos();
    }

    function getHoraAtualComSegundos() {
        const agora = new Date();
        const hora = String(agora.getHours()).padStart(2, '0');
        const minuto = String(agora.getMinutes()).padStart(2, '0');
        const segundo = String(agora.getSeconds()).padStart(2, '0');
        return `${hora}:${minuto}:${segundo}`;
    }

    function formatarHoraComSegundos(valor) {
        const texto = String(valor || "").trim();
        if (/^\d{2}:\d{2}:\d{2}$/.test(texto)) return texto;
        if (/^\d{2}:\d{2}$/.test(texto)) return `${texto}:00`;
        return texto;
    }

    function formatarHoraCompleta(valor) {
        const numeros = String(valor || "").replace(/\D/g, '').slice(0, 6);
        if (numeros.length <= 2) return numeros;
        if (numeros.length <= 4) return `${numeros.slice(0, 2)}:${numeros.slice(2)}`;
        return `${numeros.slice(0, 2)}:${numeros.slice(2, 4)}:${numeros.slice(4)}`;
    }

    function moverCursorParaFim(elemento) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(elemento);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function aplicarMascaraHorarioCelula(celula) {
        if (!celula || celula.dataset.horaMask === "true") return;
        celula.dataset.horaMask = "true";
        celula.setAttribute('inputmode', 'numeric');
        celula.addEventListener('input', () => {
            const formatado = formatarHoraCompleta(celula.innerText);
            if (celula.innerText !== formatado) {
                celula.innerText = formatado;
                moverCursorParaFim(celula);
            }
        });
    }

    function abrirDetalhesRegistroAgente(dados, titulo = "Detalhes do registro") {
        let modal = document.getElementById('modalDetalhesAgente');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalDetalhesAgente';
            modal.className = 'modal-detalhes-agente';
            modal.innerHTML = `
                <div class="modal-detalhes-card" role="dialog" aria-modal="true" aria-labelledby="modalDetalhesAgenteTitulo">
                    <div class="modal-detalhes-header">
                        <h2 id="modalDetalhesAgenteTitulo"></h2>
                        <button type="button" class="modal-detalhes-fechar" aria-label="Fechar detalhes">×</button>
                    </div>
                    <div class="modal-detalhes-body"></div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('.modal-detalhes-fechar').addEventListener('click', () => modal.classList.remove('open'));
            modal.addEventListener('click', (event) => {
                if (event.target === modal) modal.classList.remove('open');
            });
        }

        const campos = [
            ["Veículo e Local", dados.veiculo],
            ["Agentes e Condutor", dados.agente],
            ["HT", dados.ht],
            ["ASE", dados.ase],
            ["Função", dados.situacao],
            ["Maletas", dados.maletas],
            ["Região", dados.zona],
            ["Hora Início", formatarHoraComSegundos(dados.horaInicio)],
            ["Hora Fim", formatarHoraComSegundos(dados.horaFim)],
            ["Tipo Registro", dados.tipo],
            ["Ponto Base", dados.pontoBase],
            ["Data", dados.dataRelatorio]
        ].filter(([, valor]) => String(valor || "").trim());

        modal.querySelector('#modalDetalhesAgenteTitulo').textContent = titulo;
        modal.querySelector('.modal-detalhes-body').innerHTML = campos.map(([label, valor]) => `
            <div class="modal-detalhes-item">
                <strong>${label}</strong>
                <span>${String(valor || "-").replace(/\n/g, '<br>')}</span>
            </div>
        `).join("");
        modal.classList.add('open');
    }

    function criarBotaoVisualizarRegistro(dados, titulo) {
        const btnVisualizar = document.createElement('button');
        btnVisualizar.type = 'button';
        btnVisualizar.className = 'btn btn-visualizar-registro';
        btnVisualizar.innerText = 'VISUALIZAR';
        btnVisualizar.setAttribute('aria-label', 'Visualizar detalhes do registro');
        btnVisualizar.onclick = () => abrirDetalhesRegistroAgente(dados, titulo);
        return btnVisualizar;
    }

    function criarCampoEditorHistorico(nome, label, valor, multiline = false) {
        const labelEl = document.createElement('label');
        if (multiline) labelEl.className = 'campo-editor-largo';
        labelEl.innerHTML = `<span>${label}</span>`;
        const campo = document.createElement(multiline ? 'textarea' : 'input');
        campo.name = nome;
        campo.value = valor || "";
        if (multiline) {
            campo.spellcheck = true;
            campo.lang = 'pt-BR';
            campo.setAttribute('autocorrect', 'on');
            campo.setAttribute('autocapitalize', 'sentences');
        }
        if (nome === 'horaInicio' || nome === 'horaFim') {
            campo.inputMode = 'numeric';
            campo.maxLength = 8;
            campo.placeholder = 'HH:MM:SS';
            campo.addEventListener('input', () => {
                campo.value = formatarHoraCompleta(campo.value);
            });
        }
        labelEl.appendChild(campo);
        return labelEl;
    }

    function abrirEditorHistoricoAgente(id, dados) {
        if (!usuarioEhAdmin || !id) return;

        let modal = document.getElementById('modalEditorHistoricoAgente');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalEditorHistoricoAgente';
            modal.className = 'modal-detalhes-agente';
            modal.innerHTML = `
                <div class="modal-detalhes-card" role="dialog" aria-modal="true" aria-labelledby="modalEditorHistoricoTitulo">
                    <div class="modal-detalhes-header">
                        <h2 id="modalEditorHistoricoTitulo">Editar Histórico</h2>
                        <button type="button" class="modal-detalhes-fechar" aria-label="Fechar editor">×</button>
                    </div>
                    <form class="historico-editor-form"></form>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('.modal-detalhes-fechar').addEventListener('click', () => modal.classList.remove('open'));
            modal.addEventListener('click', (event) => {
                if (event.target === modal) modal.classList.remove('open');
            });
        }

        const form = modal.querySelector('.historico-editor-form');
        form.innerHTML = "";
        [
            ['veiculo', 'Veículo', dados.veiculo],
            ['ht', 'HT', dados.ht],
            ['ase', 'ASE', dados.ase],
            ['situacao', 'Função', dados.situacao],
            ['maletas', 'Maletas', dados.maletas],
            ['zona', 'Região', dados.zona],
            ['horaInicio', 'Hora Início', formatarHoraComSegundos(dados.horaInicio)],
            ['horaFim', 'Hora Fim', formatarHoraComSegundos(dados.horaFim)],
            ['tipo', 'Tipo Registro', dados.tipo]
        ].forEach(([nome, label, valor]) => form.appendChild(criarCampoEditorHistorico(nome, label, valor)));
        form.appendChild(criarCampoEditorHistorico('agente', 'Agente / Condutor', dados.agente, true));
        form.appendChild(criarCampoEditorHistorico('pontoBase', 'Ponto Base', dados.pontoBase, true));

        const actions = document.createElement('div');
        actions.className = 'historico-editor-actions';
        actions.innerHTML = `
            <button type="button" class="btn-cancelar-editor-historico">CANCELAR</button>
            <button type="submit" class="btn-salvar-editor-historico">SALVAR ALTERAÇÕES</button>
        `;
        form.appendChild(actions);

        actions.querySelector('.btn-cancelar-editor-historico').onclick = () => modal.classList.remove('open');
        form.onsubmit = async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const atualizacao = {};
            for (const [chave, valor] of formData.entries()) {
                const texto = String(valor || "").trim().toUpperCase();
                atualizacao[chave] = (chave === 'horaInicio' || chave === 'horaFim')
                    ? formatarHoraComSegundos(texto)
                    : texto;
            }

            try {
                await updateDoc(doc(db, "historico_agentes", id), atualizacao);
                registrarLogAuditoria("EDIÇÃO HISTÓRICO AGENTES", `Registro ID ${id} editado por ${nomeUsuarioLogado}.`);
                modal.classList.remove('open');
                alert("Registro atualizado.");
            } catch (e) {
                alert("Erro ao editar registro: " + e.message);
            }
        };

        modal.classList.add('open');
        form.querySelector('input, textarea')?.focus();
    }

    function limparFormularioEquipe() {
        const camposParaLimpar = ['veiculo', 'situacao', 'maletas', 'zona', 'horaInicio', 'pontoBase'];
        camposParaLimpar.forEach((id) => {
            const campo = document.getElementById(id);
            if (campo) campo.value = "";
        });

        document.querySelectorAll('.agente-input').forEach((campo) => {
            campo.value = "";
            campo.disabled = false;
        });
        document.querySelectorAll('input[name="condutor"]').forEach((campo) => {
            campo.checked = false;
            campo.disabled = false;
        });
        document.querySelectorAll('.input-dinamico-ht, .input-dinamico-ase').forEach((campo) => {
            campo.value = "";
        });

        gerarCamposDinamicos();
        carregarAgentes();
        verificarLimiteAgentes();
    }

    function obterClasseRegiao(zona) {
        if (!zona) return '';
        const z = zona.toUpperCase();
        if (z === 'REGIÃO 1') return 'regiao-1';
        if (z === 'REGIÃO 2') return 'regiao-2';
        if (z === 'REGIÃO 3') return 'regiao-3';
        if (z === 'REGIÃO 4') return 'regiao-4';
        if (z === 'REGIÃO 5') return 'regiao-5';
        if (z === 'GERAL') return 'regiao-geral';
        return '';
    }

    function escapeHtml(valor) {
        return String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function normalizarBuscaAgente(valor) {
        return String(valor || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim();
    }

    function filtrarAgentesDisponiveis(valor = "", mostrarTodos = false) {
        const termo = normalizarBuscaAgente(valor);
        if (!mostrarTodos && termo.length < 2) return [];
        return agentesDatalistDisponiveis
            .filter((agente) => mostrarTodos || normalizarBuscaAgente(agente).includes(termo))
            .slice(0, mostrarTodos ? 300 : 30);
    }

    function atualizarDatalistAgentes(valor = "", mostrarTodos = false) {
        const dl = document.getElementById('listaAgentes');
        if (!dl) return;

        dl.innerHTML = "";
        filtrarAgentesDisponiveis(valor, mostrarTodos).forEach((agente) => {
                const opt = document.createElement('option');
                opt.value = agente;
                dl.appendChild(opt);
            });
    }

    function fecharListasAgentes() {
        document.querySelectorAll('.agent-picker-list.open').forEach((lista) => {
            lista.classList.remove('open');
        });
    }

    function renderizarListaAgente(campo, mostrarTodos = false) {
        const picker = campo?.closest('.agent-picker');
        const lista = picker?.querySelector('.agent-picker-list');
        if (!lista) return;

        lista.innerHTML = "";
        if (campo.disabled) {
            lista.classList.remove('open');
            return;
        }

        const opcoes = filtrarAgentesDisponiveis(campo.value, mostrarTodos);
        if (!opcoes.length) {
            lista.classList.remove('open');
            return;
        }

        opcoes.forEach((agente) => {
            const opcao = document.createElement('button');
            opcao.type = 'button';
            opcao.className = 'agent-picker-option';
            opcao.textContent = agente;
            opcao.addEventListener('mousedown', (event) => event.preventDefault());
            opcao.addEventListener('click', () => {
                campo.value = agente;
                lista.classList.remove('open');
                campo.dispatchEvent(new Event('change', { bubbles: true }));
            });
            lista.appendChild(opcao);
        });
        lista.classList.add('open');
    }

    function atualizarPickersAgentes(valor = "", mostrarTodos = false) {
        document.querySelectorAll('.agent-picker .agente-input:focus, .agent-picker .edit-agente-input:focus').forEach((campo) => {
            renderizarListaAgente(campo, mostrarTodos);
        });
    }

    function prepararCampoAgenteComSeta(campo) {
        if (!campo || campo.dataset.agentPickerReady === "true") return;
        campo.dataset.agentPickerReady = "true";
        campo.setAttribute('list', 'listaAgentes');
    }

    function carregarAgentes(agentesSelecionadosNoForm = []) {
        const dl = document.getElementById('listaAgentes');
        dl.innerHTML = "";
        const camposAgentes = document.querySelectorAll('.agente-input');
        
        const agentesFiltrados = agentesDB.filter(agente => 
            !agentesSelecionadosNoForm.includes(agente) && 
            !agentesEmUso.has(agente)
        );
        
        const agentesOrdenados = agentesFiltrados.sort();
        agentesDatalistDisponiveis = agentesOrdenados;
        atualizarDatalistAgentes();

        camposAgentes.forEach((campo, index) => {
            prepararCampoAgenteComSeta(campo);
            campo.placeholder = `SELECIONE AGENTE ${index + 1}`;
        });
    }

    async function carregarAgentesDoServidor() {
        try {
            const user = auth.currentUser;
            if (!user) return;

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

            const agentesServidor = (resultado.agentes || [])
                .map((agente) => String(agente.nome || "").trim().toUpperCase())
                .filter(Boolean);

            if (agentesServidor.length) {
                agentesDB = [...new Set(agentesServidor)].sort((a, b) => a.localeCompare(b, "pt-BR"));
            } else {
                agentesDB = [...new Set(window.STTU_AGENTES_PADRAO || agentesDB)]
                    .map((agente) => String(agente || "").trim().toUpperCase())
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b, "pt-BR"));
            }
            carregarAgentes();
        } catch (error) {
            console.error("Erro ao carregar agentes/condutores do servidor:", error);
            agentesDB = [...new Set(window.STTU_AGENTES_PADRAO || agentesDB)].sort((a, b) => a.localeCompare(b, "pt-BR"));
            carregarAgentes();
        }
    }

    function gerarCamposDinamicos() {
        const veiculo = document.getElementById('veiculo').value;
        const containerHT = document.getElementById('container-ht');
        const containerASE = document.getElementById('container-ase');

        let qtd = 1;
        // UMT tem 5 campos
        if (veiculo.startsWith('VT') || veiculo === 'GUINCHO' || veiculo === 'UMT') {
            qtd = 5;
        }

        containerHT.innerHTML = "";
        containerASE.innerHTML = "";

        for (let i = 0; i < qtd; i++) {
            let inputHT = document.createElement('input');
            inputHT.type = 'text'; 
            inputHT.className = 'campo-numerico only-numbers input-multiplo input-dinamico-ht';
            inputHT.placeholder = qtd > 1 ? `HT ${i+1}` : 'Nº HT';
            inputHT.oninput = function() { this.value = this.value.replace(/[^0-9]/g, ''); };
            containerHT.appendChild(inputHT);

            let inputASE = document.createElement('input');
            inputASE.type = 'text'; 
            inputASE.className = 'campo-numerico only-numbers input-multiplo input-dinamico-ase';
            inputASE.placeholder = qtd > 1 ? `ASE ${i+1}` : 'Nº ASE';
            // PERMITINDO VÍRGULA
            inputASE.oninput = function() { this.value = this.value.replace(/[^0-9,]/g, ''); };
            containerASE.appendChild(inputASE);
        }
    }

    function atualizarOpcoesDisponiveis() {
        const inputs = document.querySelectorAll('.agente-input');
        const selecionados = [];
        inputs.forEach(input => {
            const val = input.value.trim().toUpperCase();
            if (val !== "") selecionados.push(val);
        });
        carregarAgentes(selecionados);
    }

    function verificarLimiteAgentes() {
        const veiculo = document.getElementById('veiculo').value;
        const rows = document.querySelectorAll('.agente-row');
        const locaisFixos = ["PONTO FIXO", "COTT", "CIOSP", "BASE MIDWAY", "GUINCHO"];
        
        // UMT permite múltiplos agentes, então NÃO entra em 'apenasUmAgente'
        const apenasUmAgente = veiculo.startsWith("MT") || locaisFixos.includes(veiculo);
        
        // UMT desabilita condutor
        const semCondutorNecessario = ["PONTO FIXO", "COTT", "CIOSP", "BASE MIDWAY", "UMT"].includes(veiculo);

        rows.forEach((row, index) => {
            const input = row.querySelector('.agente-input');
            const radio = row.querySelector('.condutor-radio');
            if (index > 0) {
                if (apenasUmAgente) {
                    input.value = ""; input.disabled = true;
                    radio.disabled = true; radio.checked = false;
                    row.style.opacity = "0.3";
                } else {
                    input.disabled = false; radio.disabled = false;
                    row.style.opacity = "1";
                }
            } else {
                if (semCondutorNecessario) {
                    radio.checked = false; radio.disabled = true;
                } else if (apenasUmAgente) {
                    radio.checked = true; radio.disabled = false;
                } else {
                    radio.disabled = false;
                }
            }
        });
        atualizarOpcoesDisponiveis();
        gerarCamposDinamicos();
    }

    function gerarListaVeiculos() {
        const select = document.getElementById('veiculo');
        select.innerHTML = '<option value="">Selecione...</option>';
        const grupoMT = document.createElement('optgroup'); grupoMT.label = "MOTOS (MT)";
        for (let i = 1; i <= 80; i++) {
            let n = i < 10 ? '0' + i : i;
            grupoMT.appendChild(new Option('MT ' + n, 'MT ' + n));
        }
        select.appendChild(grupoMT);
        const grupoVT = document.createElement('optgroup'); grupoVT.label = "VIATURAS (VT)";
        for (let i = 1; i <= 16; i++) {
            let n = i < 10 ? '0' + i : i;
            grupoVT.appendChild(new Option('VT ' + n, 'VT ' + n));
        }
        select.appendChild(grupoVT);
        const gO = document.createElement('optgroup'); gO.label = "OUTROS";
        gO.appendChild(new Option('UMT', 'UMT')); 
        gO.appendChild(new Option('GUINCHO', 'GUINCHO'));
        gO.appendChild(new Option('PONTO FIXO', 'PONTO FIXO'));
        gO.appendChild(new Option('COTT', 'COTT'));
        gO.appendChild(new Option('CIOSP', 'CIOSP'));
        gO.appendChild(new Option('BASE MIDWAY', 'BASE MIDWAY'));
        select.appendChild(gO);
    }

    function telaCompactaAgentes() {
        return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
    }

    function segundosDoHorario(valor) {
        const partes = String(valor || "").match(/\d{1,2}/g) || [];
        const h = Number(partes[0] || 0);
        const m = Number(partes[1] || 0);
        const s = Number(partes[2] || 0);
        return (h * 3600) + (m * 60) + s;
    }

    function timestampSegundos(dados) {
        return dados?.timestamp?.seconds || dados?.timestamp?.toMillis?.() / 1000 || 0;
    }

    function compararHorarioDecrescente(a, b) {
        const horaA = segundosDoHorario(a.horaInicio || a.horaFim);
        const horaB = segundosDoHorario(b.horaInicio || b.horaFim);
        if (horaA !== horaB) return horaB - horaA;

        const fimA = segundosDoHorario(a.horaFim);
        const fimB = segundosDoHorario(b.horaFim);
        if (fimA !== fimB) return fimB - fimA;

        return timestampSegundos(b) - timestampSegundos(a);
    }

    // --- FIREBASE OPS ---
    const qAtivos = query(collection(db, "ativos_agentes"), orderBy("timestamp", "asc"));
    onSnapshot(qAtivos, (snapshot) => {
        listaAtivosCache = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            data.id = docSnap.id;
            listaAtivosCache.push(data);
        });
        renderizarTabelaAtivos();
    });

    function renderizarTabelaAtivos() {
        tabelaAtivos.innerHTML = ""; 
        veiculosEmUso.clear(); 
        agentesEmUso.clear(); 

        const listaRender = [...listaAtivosCache].sort(compararHorarioDecrescente);

        listaRender.forEach((data) => {
            adicionarLinha(tabelaAtivos, data, true);
            veiculosEmUso.add(data.veiculo);
            
            if (data.agente) {
                const linhas = data.agente.split('\n');
                linhas.forEach(linha => {
                    let nomeLimpo = linha.replace(' (C)', '').trim();
                    if(nomeLimpo) agentesEmUso.add(nomeLimpo);
                });
            }
        });
        carregarAgentes(); 
    }

    const dataHoje = atualizarDataEHora(); 
    
    // VARIÁVEL GLOBAL PARA ARMAZENAR DADOS DO HISTÓRICO
    let listaHistoricoGlobal = [];

    const qHistorico = query(
        collection(db, "historico_agentes"), 
        where("dataRelatorio", "==", dataHoje)
    );

    onSnapshot(qHistorico, (snapshot) => {
        listaHistoricoGlobal = [];
        snapshot.forEach((docSnap) => {
            listaHistoricoGlobal.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        // Renderiza a tabela (agora segura, pois usa a variável global e admin já definido)
        renderizarTabelaHistorico();
    });

    function renderizarTabelaHistorico() {
        relatorioFinalTbody.innerHTML = "";
        
        // Ordena por timestamp
        const listaRender = [...listaHistoricoGlobal].sort(compararHorarioDecrescente);

        listaRender.forEach((data) => {
            adicionarAoRelatorioVisual(data, data.horaFim, data.tipo);
        });
    }

    async function salvarNoFirebase(colecao, dados) {
        try {
            await addDoc(collection(db, colecao), {
                ...dados,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            alert("Erro ao salvar no banco de dados.");
            console.error(e);
        }
    }

    async function devolverVeiculo(dados, horaFim) {
        const dadosHistorico = {...dados, horaFim, tipo: 'ENCERRAMENTO'};
        delete dadosHistorico.id; 
        delete dadosHistorico.timestamp; 
        try {
            await addDoc(collection(db, "historico_agentes"), { ...dadosHistorico, timestamp: serverTimestamp() });
            await deleteDoc(doc(db, "ativos_agentes", dados.id));
            
            // --- LOG DE AUDITORIA ---
            registrarLogAuditoria("DEVOLUÇÃO VEÍCULO", `Veículo: ${dados.veiculo} devolvido por ${nomeUsuarioLogado}.`);

        } catch (e) { alert("Erro ao devolver: " + e.message); }
    }

    function adicionarAoRelatorioVisual(dados, horaFim, tipoRegistro) {
        const row = relatorioFinalTbody.insertRow();
        const chaves = ['veiculo', 'agente', 'ht', 'ase', 'situacao', 'maletas', 'zona', 'horaInicio', 'horaFim', 'tipo', 'pontoBase'];
        let dadosDisplay = {...dados};
        if(horaFim) dadosDisplay.horaFim = horaFim;
        if(tipoRegistro) dadosDisplay.tipo = tipoRegistro;
        
        chaves.forEach(key => {
            const cell = row.insertCell();
            const valorDisplay = (key === 'horaInicio' || key === 'horaFim')
                ? formatarHoraComSegundos(dadosDisplay[key])
                : dadosDisplay[key];
            let conteudo = (String(valorDisplay) || "").replace(/\n/g, '<br>');
            
            if (key === 'zona') {
                cell.className = obterClasseRegiao(dadosDisplay[key]);
            }

            if (key === 'agente') conteudo = conteudo.replace(/\(C\)/g, '<b class="condutor-destaque"> [CONDUTOR]</b>');
            if (key === 'horaFim') cell.className = 'hora-fim-celula';
            if (key === 'tipo') cell.className = dadosDisplay.tipo === 'ENCAMINHAMENTO' ? 'status-encaminhado' : 'status-encerrado';
            cell.innerHTML = conteudo;
        });

        const cellDataMobile = row.insertCell();
        cellDataMobile.className = 'historico-data-mobile';
        cellDataMobile.innerText = dadosDisplay.dataRelatorio || dataHoje || "-";

        // --- COLUNA DE AÇÃO (EXCLUIR) ---
        const cellAcao = row.insertCell();
        cellAcao.className = 'acao-botoes';
        cellAcao.appendChild(criarBotaoVisualizarRegistro(dadosDisplay, "Histórico de Atividade"));
        
        if (usuarioEhAdmin) {
            const btnExcluir = document.createElement('button');
            btnExcluir.type = 'button';
            btnExcluir.innerHTML = '&#10006;'; // X Symbol
            btnExcluir.className = 'btn-excluir-x';
            btnExcluir.title = "Excluir registro permanentemente";
            btnExcluir.setAttribute('aria-label', 'Excluir registro permanentemente');
            btnExcluir.onclick = function() {
                excluirItemHistorico(dados.id);
            };
            cellAcao.appendChild(btnExcluir);

            const btnEditar = document.createElement('button');
            btnEditar.type = 'button';
            btnEditar.className = 'btn btn-editar-historico';
            btnEditar.innerText = 'EDITAR';
            btnEditar.title = "Editar registro do histórico";
            btnEditar.setAttribute('aria-label', 'Editar registro do histórico');
            btnEditar.onclick = function() {
                abrirEditorHistoricoAgente(dados.id, dadosDisplay);
            };
            cellAcao.appendChild(btnEditar);
        }
    }

    async function excluirItemHistorico(id) {
        if (!usuarioEhAdmin) return;
        
        if (confirm("ATENÇÃO ADMIN:\n\nDeseja realmente excluir este registro do histórico permanentemente?")) {
            try {
                await deleteDoc(doc(db, "historico_agentes", id));
                registrarLogAuditoria("EXCLUSÃO HISTÓRICO", `Registro ID ${id} excluído por ${nomeUsuarioLogado}.`);
                alert("Registro excluído.");
            } catch (e) {
                alert("Erro ao excluir: " + e.message);
            }
        }
    }

    function adicionarLinha(tabela, dados, ativo) {
        const row = tabela.insertRow();
        const chaves = ['veiculo', 'agente', 'ht', 'ase', 'situacao', 'maletas', 'zona', 'horaInicio', 'pontoBase'];
        const cellsMap = {};

        chaves.forEach(key => {
            const cell = row.insertCell();
            cellsMap[key] = cell;
            const valorDisplay = key === 'horaInicio' ? formatarHoraComSegundos(dados[key]) : dados[key];
            let conteudo = (String(valorDisplay) || "").replace(/\n/g, '<br>');
            
            if (key === 'zona') {
                cell.className = obterClasseRegiao(dados[key]);
            }

            if(key === 'agente') conteudo = conteudo.replace(/\(C\)/g, '<b class="condutor-destaque"> [CONDUTOR]</b>');
            cell.innerHTML = conteudo;
        });

        if (ativo) {
            const actionCell = row.insertCell();
            actionCell.className = 'acao-botoes';
            actionCell.appendChild(criarBotaoVisualizarRegistro(dados, "Veículo em Operação"));
            
            // --- AQUI VEM O BLOQUEIO: Só cria botões se NÃO for visualizador
            if (!isVisualizador) {
                const actionRow = document.createElement('div');
                actionRow.className = 'acao-botoes-row';

                const btnDevolver = document.createElement('button');
                btnDevolver.innerHTML = 'DEVOLVER'; 
                btnDevolver.className = 'btn btn-devolver';
                btnDevolver.onclick = function() {
                    if(confirm(`Devolver ${dados.veiculo}?`)) {
                        const horaFim = getHoraAtualComSegundos();
                        devolverVeiculo(dados, horaFim);
                    }
                };
                actionRow.appendChild(btnDevolver);

                if (dados.veiculo.startsWith('MT') || dados.veiculo.startsWith('VT') || dados.veiculo === 'UMT') {
                    const btnEncaminhar = document.createElement('button');
                    btnEncaminhar.innerHTML = 'ENCAMINHAR';
                    btnEncaminhar.className = 'btn btn-encaminhar';
                    
                    // --- LÓGICA DE EDIÇÃO/ENCAMINHAR ---
                    btnEncaminhar.onclick = async function() {
                        const editaveis = ['situacao', 'maletas', 'pontoBase', 'ht', 'ase', 'horaInicio'];
                        
                        if (btnEncaminhar.innerHTML === 'ENCAMINHAR') {
                            editaveis.forEach(key => { 
                                cellsMap[key].contentEditable = "true"; 
                                cellsMap[key].classList.add('editando-celula'); 
                            });
                            cellsMap.horaInicio.innerText = getHoraAtualComSegundos();
                            aplicarMascaraHorarioCelula(cellsMap.horaInicio);
                            
                            // LÓGICA DO DROPDOWN DA ZONA
                            const zonaAtual = cellsMap['zona'].innerText.trim();
                            cellsMap['zona'].className = ''; 
                            cellsMap['zona'].innerHTML = `<select class="edit-zona">
                                <option value="REGIÃO 1" ${zonaAtual==='REGIÃO 1'?'selected':''}>REGIÃO 1</option>
                                <option value="REGIÃO 2" ${zonaAtual==='REGIÃO 2'?'selected':''}>REGIÃO 2</option>
                                <option value="REGIÃO 3" ${zonaAtual==='REGIÃO 3'?'selected':''}>REGIÃO 3</option>
                                <option value="REGIÃO 4" ${zonaAtual==='REGIÃO 4'?'selected':''}>REGIÃO 4</option>
                                <option value="REGIÃO 5" ${zonaAtual==='REGIÃO 5'?'selected':''}>REGIÃO 5</option>
                                <option value="GERAL" ${zonaAtual==='GERAL'?'selected':''}>GERAL</option>
                            </select>`;

                            // LÓGICA DOS AGENTES (RADIOS)
                            const agentesAtuaisRaw = cellsMap['agente'].innerText.split('\n');
                            cellsMap['agente'].innerHTML = '';
                            cellsMap['agente'].classList.add('editando-celula');
                            
                            for(let i=0; i<5; i++) {
                                const linha = agentesAtuaisRaw[i] || "";
                                const isCond = linha.includes('[CONDUTOR]');
                                const nome = linha.replace(' [CONDUTOR]', '').trim();
                                
                                const div = document.createElement('div');
                                div.className = 'edit-row-container';
                                div.innerHTML = `
                                    <input type="radio" name="editCondutor_${dados.id}" class="condutor-radio" ${isCond?'checked':''}>
                                    <input type="text" class="edit-agente-input" list="listaAgentes" value="${nome}">
                                `;
                                cellsMap['agente'].appendChild(div);
                            }

                            btnEncaminhar.innerHTML = 'SALVAR';
                            btnEncaminhar.className = 'btn btn-confirmar';

                        } else {
                            // SALVAR NO BANCO
                            const inputsEdit = cellsMap['agente'].querySelectorAll('.edit-agente-input');
                            const radiosEdit = cellsMap['agente'].querySelectorAll(`input[name="editCondutor_${dados.id}"]`);
                            
                            let novaLista = [];
                            let condutorSelecionado = false;

                            inputsEdit.forEach((inp, idx) => {
                                let nome = inp.value.trim().toUpperCase();
                                if(nome !== "") {
                                    if(radiosEdit[idx].checked) {
                                        nome += " (C)";
                                        condutorSelecionado = true;
                                    }
                                    novaLista.push(nome);
                                }
                            });

                            if(novaLista.length === 0) { alert("A equipe não pode ficar vazia."); return; }
                            
                            // UMT TAMBÉM NÃO EXIGE CONDUTOR NO EDIT
                            const semCondutor = ["PONTO FIXO", "COTT", "CIOSP", "BASE MIDWAY", "UMT"].includes(dados.veiculo);
                            if(!semCondutor && !condutorSelecionado) { 
                                alert("Selecione quem é o CONDUTOR (⦿) da equipe antes de salvar."); return; 
                            }

                            const horaCorte = formatarHoraComSegundos(cellsMap.horaInicio.innerText.trim() || getHoraAtualComSegundos());

                            // Histórico do estado anterior
                            const histEnc = {...dados};
                            delete histEnc.id; delete histEnc.timestamp;
                            histEnc.horaFim = horaCorte;
                            histEnc.tipo = 'ENCAMINHAMENTO';
                            await addDoc(collection(db, "historico_agentes"), { ...histEnc, timestamp: serverTimestamp() });

                            const novaZona = cellsMap['zona'].querySelector('select').value;
                            
                            const detalhesLog = `Veículo: ${dados.veiculo} editado/encaminhado por ${nomeUsuarioLogado}. Zona: ${novaZona}. HT/ASE Atualizados.`;

                            // ATUALIZAÇÃO NO BANCO (INCLUINDO HT E ASE)
                            await updateDoc(doc(db, "ativos_agentes", dados.id), {
                                zona: novaZona,
                                horaInicio: horaCorte,
                                agente: novaLista.join('\n'),
                                situacao: cellsMap['situacao'].innerText.trim().toUpperCase(),
                                maletas: cellsMap['maletas'].innerText.trim().toUpperCase(),
                                pontoBase: cellsMap['pontoBase'].innerText.trim().toUpperCase(),
                                ht: cellsMap['ht'].innerText.trim().toUpperCase(),   // <--- HT EDITADO
                                ase: cellsMap['ase'].innerText.trim().toUpperCase()  // <--- ASE EDITADO
                            });

                            registrarLogAuditoria("ENCAMINHAR/EDITAR", detalhesLog);
                        }
                    };
                    // -------------------------------------------------------

                    actionRow.appendChild(btnEncaminhar);
                }

                actionCell.appendChild(actionRow);

                if (usuarioEhAdmin) {
                    const btnEditar = document.createElement('button');
                    btnEditar.innerHTML = 'EDITAR';
                    btnEditar.className = 'btn btn-editar-ativo';
                    let estadoOriginalEdicao = null;
                    let cancelarEdicaoComEsc = null;

                    const cancelarEdicaoAdmin = () => {
                        if (!estadoOriginalEdicao) return;

                        chaves.forEach((key) => {
                            cellsMap[key].innerHTML = estadoOriginalEdicao[key].html;
                            cellsMap[key].className = estadoOriginalEdicao[key].className;
                            cellsMap[key].contentEditable = "false";
                        });

                        btnDevolver.disabled = false;
                        const btnEncaminharAtual = actionRow.querySelector('.btn-encaminhar, .btn-confirmar');
                        if (btnEncaminharAtual) btnEncaminharAtual.disabled = false;

                        btnEditar.dataset.mode = "";
                        btnEditar.innerHTML = 'EDITAR';
                        btnEditar.classList.remove('btn-editar-salvar');
                        estadoOriginalEdicao = null;

                        if (cancelarEdicaoComEsc) {
                            document.removeEventListener('keydown', cancelarEdicaoComEsc);
                            cancelarEdicaoComEsc = null;
                        }
                    };

                    btnEditar.onclick = async function() {
                        if (btnEditar.dataset.mode !== 'salvar') {
                            estadoOriginalEdicao = {};
                            chaves.forEach((key) => {
                                estadoOriginalEdicao[key] = {
                                    html: cellsMap[key].innerHTML,
                                    className: cellsMap[key].className
                                };
                            });

                            btnDevolver.disabled = true;
                            const btnEncaminharAtual = actionRow.querySelector('.btn-encaminhar, .btn-confirmar');
                            if (btnEncaminharAtual) btnEncaminharAtual.disabled = true;

                            ['veiculo', 'ht', 'ase', 'situacao', 'maletas', 'horaInicio', 'pontoBase'].forEach(key => {
                                cellsMap[key].contentEditable = "true";
                                cellsMap[key].classList.add('editando-celula');
                            });
                            aplicarMascaraHorarioCelula(cellsMap.horaInicio);

                            const zonaAtual = cellsMap.zona.innerText.trim();
                            cellsMap.zona.className = 'editando-celula';
                            cellsMap.zona.innerHTML = `<select class="edit-zona">
                                <option value="REGIÃO 1" ${zonaAtual==='REGIÃO 1'?'selected':''}>REGIÃO 1</option>
                                <option value="REGIÃO 2" ${zonaAtual==='REGIÃO 2'?'selected':''}>REGIÃO 2</option>
                                <option value="REGIÃO 3" ${zonaAtual==='REGIÃO 3'?'selected':''}>REGIÃO 3</option>
                                <option value="REGIÃO 4" ${zonaAtual==='REGIÃO 4'?'selected':''}>REGIÃO 4</option>
                                <option value="REGIÃO 5" ${zonaAtual==='REGIÃO 5'?'selected':''}>REGIÃO 5</option>
                                <option value="GERAL" ${zonaAtual==='GERAL'?'selected':''}>GERAL</option>
                            </select>`;

                            const agentesAtuaisRaw = cellsMap.agente.innerText.split('\n');
                            cellsMap.agente.innerHTML = '';
                            cellsMap.agente.classList.add('editando-celula');
                            for (let i = 0; i < 5; i++) {
                                const linha = agentesAtuaisRaw[i] || "";
                                const isCondutor = linha.includes('[CONDUTOR]');
                                const nome = linha.replace(' [CONDUTOR]', '').trim();
                                const div = document.createElement('div');
                                div.className = 'edit-row-container';
                                div.innerHTML = `
                                    <input type="radio" name="editAdminCondutor_${dados.id}" class="condutor-radio" ${isCondutor ? 'checked' : ''}>
                                    <input type="text" class="edit-agente-input" list="listaAgentes" value="${escapeHtml(nome)}">
                                `;
                                cellsMap.agente.appendChild(div);
                                const campoEditAgente = div.querySelector('.edit-agente-input');
                                prepararCampoAgenteComSeta(campoEditAgente);
                                campoEditAgente.addEventListener('input', function() {
                                    const inicio = this.selectionStart;
                                    const fim = this.selectionEnd;
                                    this.value = this.value.toUpperCase();
                                    this.setSelectionRange(inicio, fim);
                                    atualizarDatalistAgentes(this.value);
                                });
                                campoEditAgente.addEventListener('focus', function() {
                                    atualizarDatalistAgentes(this.value, true);
                                });
                            }

                            btnEditar.dataset.mode = 'salvar';
                            btnEditar.innerHTML = 'SALVAR EDIÇÃO';
                            btnEditar.classList.add('btn-editar-salvar');

                            cancelarEdicaoComEsc = (event) => {
                                if (event.key !== 'Escape' || btnEditar.dataset.mode !== 'salvar') return;
                                event.preventDefault();
                                cancelarEdicaoAdmin();
                            };
                            document.addEventListener('keydown', cancelarEdicaoComEsc);
                            return;
                        }

                        const inputsEdit = cellsMap.agente.querySelectorAll('.edit-agente-input');
                        const radiosEdit = cellsMap.agente.querySelectorAll(`input[name="editAdminCondutor_${dados.id}"]`);
                        let novaLista = [];
                        let condutorSelecionado = false;

                        inputsEdit.forEach((input, index) => {
                            let nome = input.value.trim().toUpperCase();
                            if (nome) {
                                if (radiosEdit[index]?.checked) {
                                    nome += " (C)";
                                    condutorSelecionado = true;
                                }
                                novaLista.push(nome);
                            }
                        });

                        if (novaLista.length === 0) {
                            alert("A equipe não pode ficar vazia.");
                            return;
                        }

                        const novoVeiculo = cellsMap.veiculo.innerText.trim().toUpperCase();
                        const semCondutor = ["PONTO FIXO", "COTT", "CIOSP", "BASE MIDWAY", "UMT"].includes(novoVeiculo);
                        if (!semCondutor && !condutorSelecionado) {
                            alert("Selecione quem é o CONDUTOR (⦿) da equipe antes de salvar.");
                            return;
                        }

                        const novaZona = cellsMap.zona.querySelector('select')?.value || "";
                        const atualizacao = {
                            veiculo: novoVeiculo,
                            agente: novaLista.join('\n'),
                            ht: cellsMap.ht.innerText.trim().toUpperCase(),
                            ase: cellsMap.ase.innerText.trim().toUpperCase(),
                            situacao: cellsMap.situacao.innerText.trim().toUpperCase(),
                            maletas: cellsMap.maletas.innerText.trim().toUpperCase(),
                            zona: novaZona,
                            horaInicio: formatarHoraComSegundos(cellsMap.horaInicio.innerText.trim()),
                            pontoBase: cellsMap.pontoBase.innerText.trim().toUpperCase()
                        };

                        try {
                            await updateDoc(doc(db, "ativos_agentes", dados.id), atualizacao);
                            if (cancelarEdicaoComEsc) {
                                document.removeEventListener('keydown', cancelarEdicaoComEsc);
                                cancelarEdicaoComEsc = null;
                            }
                            estadoOriginalEdicao = null;
                            registrarLogAuditoria("EDITAR VEÍCULO ATIVO", `Registro ativo ${dados.id} editado por ${nomeUsuarioLogado}. Veículo: ${dados.veiculo} -> ${atualizacao.veiculo}.`);
                        } catch (e) {
                            alert("Erro ao salvar edição: " + e.message);
                        }
                    };

                    actionCell.appendChild(btnEditar);
                }
            }
        }
    }

    // Envolver o event listener em uma condicional para evitar erro se o formulário for removido
    const elForm = document.getElementById('registroForm');
    if (elForm) {
        elForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const v = document.getElementById('veiculo').value;
            const z = document.getElementById('zona').value;
            const pb = document.getElementById('pontoBase').value.trim();
            const maletasVal = document.getElementById('maletas').value.trim();
            const condutorIndex = document.querySelector('input[name="condutor"]:checked')?.value;
            const inputsAgentes = document.querySelectorAll('.agente-input');
            
            let listaSelecionada = [];
            inputsAgentes.forEach((input, index) => {
                if (input.disabled) return;
                const val = input.value.trim().toUpperCase();
                if(val !== "") {
                    listaSelecionada.push(condutorIndex !== undefined && index == condutorIndex ? `${val} (C)` : val);
                }
            });

            for (let nome of listaSelecionada) {
                let nomeLimpo = nome.replace(' (C)', '').trim();
                if (agentesEmUso.has(nomeLimpo)) {
                    alert(`ERRO: O agente ${nomeLimpo} já está em outra viatura ativa! Devolva a viatura anterior primeiro.`);
                    return;
                }
            }

            const inputsHT = document.querySelectorAll('.input-dinamico-ht');
            const valoresHT = Array.from(inputsHT).map(i => i.value).filter(v => v).join('\n');

            const inputsASE = document.querySelectorAll('.input-dinamico-ase');
            const valoresASE = Array.from(inputsASE).map(i => i.value).filter(v => v).join('\n');

            if (!v || listaSelecionada.length === 0 || !z || !pb) { alert("Preencha campos obrigatórios."); return; }
            if (!["PONTO FIXO", "COTT", "CIOSP", "BASE MIDWAY", "UMT"].includes(v) && veiculosEmUso.has(v)) { alert("Veículo em uso."); return; }
            
            // UMT TAMBÉM NÃO PRECISA DE CONDUTOR NO SUBMIT
            if (!["PONTO FIXO", "COTT", "CIOSP", "BASE MIDWAY", "UMT"].includes(v) && condutorIndex === undefined) { alert("Selecione o condutor (⦿)."); return; }

            const dados = {
                veiculo: v,
                agente: listaSelecionada.join('\n'),
                situacao: document.getElementById('situacao').value,
                ht: valoresHT,
                zona: z,
                horaInicio: document.getElementById('horaInicio').value,
                ase: valoresASE,
                maletas: maletasVal.toUpperCase(),
                pontoBase: pb.toUpperCase(),
                dataRelatorio: document.getElementById('dataRelatorio').value
            };

            salvarNoFirebase("ativos_agentes", dados); 
            
            // --- LOG DE AUDITORIA ---
            registrarLogAuditoria("REGISTRAR EQUIPE", `Veículo: ${v} - Agentes: ${listaSelecionada.join(', ')} - Registrado por: ${nomeUsuarioLogado}`);

            document.getElementById('veiculo').value = "";
            document.querySelectorAll('.agente-input').forEach(i => i.value = "");
            document.getElementById('pontoBase').value = "";
            document.getElementById('maletas').value = "";
            verificarLimiteAgentes();
        });
    }

    const btnCSV = document.getElementById('btnCSV');
    if (btnCSV) btnCSV.onclick = () => {
        let csv = ["\ufeffVEÍCULO,AGENTE,HT,ASE,FUNÇÃO,MALETAS,REGIÃO,HORA INÍCIO,HORA FIM,TIPO,PONTO BASE"];
        
        const tableHistorico = document.getElementById('relatorioFinal');
        for (let i = 1; i < tableHistorico.rows.length; i++) {
            let row = [];
            const cells = tableHistorico.rows[i].cells;
            for (let j = 0; j < cells.length; j++) {
                let data = cells[j].innerText.replace(/"/g, '""').replace(/\n/g, ' ');
                row.push(`"${data}"`);
            }
            csv.push(row.join(","));
        }

        const rowsAtivos = tabelaAtivos.rows; 
        
        for (let i = 0; i < rowsAtivos.length; i++) {
             const cells = rowsAtivos[i].cells;
             if(cells.length < 9) continue; 

             let veiculo = cells[0].innerText;
             let agente = cells[1].innerText;
             let ht = cells[2].innerText;
             let ase = cells[3].innerText;
             let funcao = cells[4].innerText;
             let maletas = cells[5].innerText;
             let zona = cells[6].innerText;
             let inicio = cells[7].innerText;
             let fim = "EM ANDAMENTO"; 
             let tipo = "ATIVO";       
             let base = cells[8].innerText;

             let row = [
                 `"${veiculo.replace(/\n/g, ' ')}"`,
                 `"${agente.replace(/\n/g, ' ')}"`,
                 `"${ht.replace(/\n/g, ' ')}"`,
                 `"${ase.replace(/\n/g, ' ')}"`,
                 `"${funcao}"`,
                 `"${maletas.replace(/\n/g, ' ')}"`,
                 `"${zona}"`,
                 `"${inicio}"`,
                 `"${fim}"`,
                 `"${tipo}"`,
                 `"${base.replace(/\n/g, ' ')}"`
             ];
             csv.push(row.join(","));
        }

        const blob = new Blob([csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_geral_${document.getElementById('dataRelatorio').value.replace(/\//g, '-')}.csv`;
        link.click();
    };

    function inicializarTelaAgentes() {
        atualizarDataEHora();
        gerarListaVeiculos();
        carregarAgentes();
        const consultaCompacta = window.matchMedia ? window.matchMedia("(max-width: 900px)") : null;
        consultaCompacta?.addEventListener?.("change", () => {
            renderizarTabelaAtivos();
            renderizarTabelaHistorico();
        });
        const tabelaAtivosEl = document.getElementById('tabelaAtivos');
        if (tabelaAtivosEl.tHead) {
            tabelaAtivosEl.tHead.remove();
        }
        const tableHead = tabelaAtivosEl.createTHead();
        const headerOriginalRow = document.getElementById('headerOriginalRow');
        const newHeaderRow = document.createElement('tr');
        Array.from(headerOriginalRow.children).forEach(th => {
            const newTh = document.createElement('th');
            newTh.innerHTML = th.innerHTML;
            newTh.className = th.className;
            newHeaderRow.appendChild(newTh);
        });
        const thAcao = document.createElement('th');
        thAcao.className = 'data-header';
        thAcao.innerText = 'AÇÃO';
        newHeaderRow.appendChild(thAcao);
        tableHead.appendChild(newHeaderRow);
        document.getElementById('veiculo').onchange = verificarLimiteAgentes;
        const horaInicio = document.getElementById('horaInicio');
        horaInicio?.addEventListener('click', preencherHoraAtualSeVazio);
        horaInicio?.addEventListener('focus', preencherHoraAtualSeVazio);
        horaInicio?.addEventListener('input', function() {
            this.value = formatarHoraCompleta(this.value);
        });
        document.querySelectorAll('[data-clear-time]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const input = document.getElementById(button.dataset.clearTime);
                if (input) input.value = "";
            });
        });
        document.querySelectorAll('[data-clear-textarea]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const campo = document.getElementById(button.dataset.clearTextarea);
                if (campo) campo.value = "";
            });
        });
        document.getElementById('btnLimparEquipe')?.addEventListener('click', (event) => {
            event.preventDefault();
            limparFormularioEquipe();
        });
        document.querySelectorAll('.agente-input').forEach(i => {
            i.oninput = function() {
                const inicio = this.selectionStart;
                const fim = this.selectionEnd;
                this.value = this.value.toUpperCase();
                this.setSelectionRange(inicio, fim);
                atualizarOpcoesDisponiveis();
                atualizarDatalistAgentes(this.value);
            };
            i.onfocus = function() {
                atualizarDatalistAgentes(this.value, true);
            };
            i.onchange = function() {
                atualizarOpcoesDisponiveis();
                atualizarDatalistAgentes(this.value);
            };
        });
        
        gerarCamposDinamicos();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", inicializarTelaAgentes, { once: true });
    } else {
        inicializarTelaAgentes();
    }

    // --- FUNÇÃO DE AUDITORIA (ADICIONE NO FINAL DO SCRIPT) ---
    async function registrarLogAuditoria(acao, detalhes) {
        if (isVisualizador) return;
        try {
            await addDoc(collection(db, "logs_auditoria"), {
                usuario: nomeUsuarioLogado || "DESCONHECIDO",
                acao: acao.toUpperCase(),
                detalhes: detalhes,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("Erro ao gerar log:", e);
        }
    }
}

iniciarAgentes2().catch((error) => {
    console.error("Erro ao carregar agentes-2:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


