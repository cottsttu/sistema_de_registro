async function iniciarSmartwall() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
    const { getFirestore, collection, doc, getDoc, query, onSnapshot, where } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");

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

    const STATUS_CONCLUIDOS = new Set(["CONCLU\u00cdDA", "CONCLUIDA", "N\u00c3O ATENDIDA", "NAO ATENDIDA"]);
    const STATUS_PAINEL_PENDENTES = ["ENCAMINHADA", "EM ANDAMENTO", "N\u00c3O ATENDIDA", "PARA O DESPACHO", "PARA O PR\u00d3XIMO TURNO"];
    const STATUS_DESPACHO = new Set(["PARA O DESPACHO"]);
    const STATUS_EM_ANDAMENTO = new Set(["ENCAMINHADA", "EM ANDAMENTO"]);
    const STATUS_ATIVOS_SMARTWALL = new Set([...STATUS_DESPACHO, ...STATUS_EM_ANDAMENTO]);
    const regioesPainel = ["REGI\u00c3O 1", "REGI\u00c3O 2", "REGI\u00c3O 3", "REGI\u00c3O 4", "REGI\u00c3O 5", "GERAL"];
    const regioesBase = regioesPainel;
    const coresRegiao = ["#67479a", "#3b364c", "#e4f001", "#64ec02", "#096acc", "#d30000"];
    const coresPainelRegiao = ["#6f42c1", "#ffcc00", "#55c80a", "#1188ff", "#e50606", "#8d55d9"];
    const coresRegiaoVt = ["#8060b2", "#554e6c", "#f2ff3b", "#80ff28", "#2387e8", "#ff2a2a"];
    const coresRegiaoMt = ["#4b3274", "#292639", "#aab300", "#43aa00", "#064a91", "#8f0000"];
    const coresTipo = ["#2f86ff", "#ffbd1a", "#64d637", "#ff4c5d", "#9d55ff"];
    const iconesTipoOcorrencia = {
        "APOIO DO AGENTE": "src/apoio_do_agente.png",
        "ESTACIONAMENTO IRREGULAR": "src/estacionamento_irregular.png",
        "FISCALIZACAO EM TRANSPORTE": "src/fiscalizacao_em_transporte.png",
        "INTERVENCAO EM VIA": "src/intervencao_via_publica.png",
        "INTERVENCAO EM VIA PUBLICA": "src/intervencao_via_publica.png",
        "INTERVENCAO VIARIA": "src/intervencao_viaria.png",
        "OUTROS": "src/outros.png",
        "PANE SEMAFORICA": "src/pane_semaforica.png",
        "SINISTRO COM VITIMA": "src/sinistro_com_vitima.png",
        "SINISTRO COM VITIMA E/OU CRIME": "src/sinistro_com_vitima_ou_crime.png",
        "SINISTRO SEM VITIMA": "src/sinistro_sem_vitima.png",
        "SINISTRO SEM VITIMA / VEICULO OFICIAL": "src/sinistro_sem_vitima.png",
        "VEICULO ABANDONADO": "src/veiculo_abandonado.png"
    };
    const turnosAtendimento = [
        { key: "total", label: "TOTAL", range: "Historico + abertos", icon: "src/total_png.png", color: "#2be477" },
        { key: "manha", label: "MANH\u00c3", range: "06:00:00 \u00e0s 11:59:59", inicio: 21600, fim: 43199, icon: "src/andamento_png.png", color: "#1188ff" },
        { key: "tarde", label: "TARDE", range: "12:00:00 \u00e0s 17:59:59", inicio: 43200, fim: 64799, icon: "src/total_png.png", color: "#ff9f1c" },
        { key: "noite", label: "NOITE", range: "18:00:00 \u00e0s 23:59:59", inicio: 64800, fim: 86399, icon: "src/concluido_png.png", color: "#9b5dff" },
        { key: "corujao", label: "CORUJ\u00c3O", range: "00:00:00 \u00e0s 05:59:59", inicio: 0, fim: 21599, icon: "src/live_png.png", color: "#16c8d8" }
    ];
    const mtIconImg = new Image();
    const vtIconImg = new Image();
    mtIconImg.addEventListener("load", () => myChartRegioes?.update("none"));
    vtIconImg.addEventListener("load", () => myChartRegioes?.update("none"));
    mtIconImg.src = "src/mt_png.png";
    vtIconImg.src = "src/vt_png.png";
    let tvDisplayFrame = null;
    let myChartRegioes = null;
    let myChartTipos = null;
    let turnoAtendimentoAtual = getTurnoAtualKey();
    let ultimosDocsHoje = [];
    let ultimosDocsAtivosAgentes = [];
    let ultimosDocsHistoricoAgentes = [];
    let ultimasOcorrenciasAtivas = [];
    let ultimaContagemRegiaoAtivas = {};
    const ocorrenciasModal = new Map();
    const zonasAtendimentoRecolhidas = new Set();
    const kpiValoresAnteriores = {
        total: null,
        andamento: null,
        concluidas: null,
        frota: null,
        despacho: null,
        encaminhada: null,
        concluidaStatus: null,
        encaminhadas: new Set(),
        listaInicializada: false
    };

    Chart.defaults.color = "#d6e4f4";
    Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    Chart.defaults.font.weight = "700";
    Chart.defaults.animation = false;

    function obterViewportEfetivo() {
        const largura = window.innerWidth || document.documentElement.clientWidth || 0;
        const altura = window.innerHeight || document.documentElement.clientHeight || 0;
        const dpr = window.devicePixelRatio || 1;
        return {
            largura,
            altura,
            dpr,
            larguraEfetiva: Math.round(largura * dpr),
            alturaEfetiva: Math.round(altura * dpr)
        };
    }

    function atualizarModoDisplaySmartwall() {
        const { largura, altura, dpr, larguraEfetiva, alturaEfetiva } = obterViewportEfetivo();
        const paisagem = largura >= altura;
        const areaEfetiva = larguraEfetiva * alturaEfetiva;
        const tv4k = paisagem && larguraEfetiva >= 3200 && alturaEfetiva >= 1600 && areaEfetiva >= 5000000;
        const tvFhd = paisagem && !tv4k && larguraEfetiva >= 1800 && alturaEfetiva >= 980 && dpr <= 1.5;
        const modoAtual = tv4k ? "tv-4k" : tvFhd ? "tv-fhd" : "default";

        if (document.body.dataset.smartwallDisplay === modoAtual) return;
        document.body.dataset.smartwallDisplay = modoAtual;
    }

    function agendarAtualizacaoModoDisplaySmartwall() {
        if (tvDisplayFrame !== null) return;
        tvDisplayFrame = window.requestAnimationFrame(() => {
            tvDisplayFrame = null;
            atualizarModoDisplaySmartwall();
        });
    }

    atualizarModoDisplaySmartwall();
    window.addEventListener("resize", agendarAtualizacaoModoDisplaySmartwall);
    window.addEventListener("orientationchange", agendarAtualizacaoModoDisplaySmartwall);

    function atualizarTemaGraficos() {
        if (myChartRegioes) {
            const dataset = myChartRegioes.data.datasets[0];
            if (dataset) {
                dataset.borderColor = document.body.dataset.theme === "day" ? "#ffffff" : "rgba(255, 255, 255, 0.82)";
            }
            myChartRegioes.update("none");
        }

        if (myChartTipos) {
            myChartTipos.update("none");
        }
    }

    window.addEventListener("sttu-theme-change", atualizarTemaGraficos);

    function getDataHojeISO() {
        const hoje = new Date();
        return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    }

    function getDataHojeBR() {
        const hoje = new Date();
        return `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    }

    const dataFiltro = getDataHojeISO();
    const dataRelatorioFiltro = getDataHojeBR();

    function normalizarTexto(valor) {
        return String(valor || "").trim().toUpperCase();
    }

    function isConcluida(ocorrencia) {
        return STATUS_CONCLUIDOS.has(normalizarTexto(ocorrencia?.situacao));
    }

    function isAtivaNoPainelPendentes(ocorrencia) {
        return STATUS_ATIVOS_SMARTWALL.has(normalizarTexto(ocorrencia?.situacao));
    }

    function escapeHtml(valor) {
        return String(valor ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function formatarNomeEquipe(nome) {
        const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
        if (partes.length <= 2) return partes.join(" ");
        const segundo = normalizarTexto(partes[1]).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const conectivos = new Set(["DE", "DA", "DO", "DAS", "DOS"]);
        return [partes[0], conectivos.has(segundo) ? partes[2] : partes[1]].filter(Boolean).join(" ");
    }

    function getTimestamp(ocorrencia) {
        if (ocorrencia?.timestamp?.seconds) return ocorrencia.timestamp.seconds;
        if (ocorrencia?.criadoEm?.seconds) return ocorrencia.criadoEm.seconds;
        return 0;
    }

    function getHoraMinutos(hora) {
        const match = String(hora || "").match(/^(\d{1,2}):(\d{2})/);
        if (!match) return -1;
        return Number(match[1]) * 60 + Number(match[2]);
    }

    function getHoraSegundos(hora) {
        const match = String(hora || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return -1;
        return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3] || 0);
    }

    function getTurnoAtualKey() {
        const agora = new Date();
        const segundos = (agora.getHours() * 3600) + (agora.getMinutes() * 60) + agora.getSeconds();
        const turno = turnosAtendimento.find((item) => item.key !== "total" && segundos >= item.inicio && segundos <= item.fim);
        return turno?.key || "manha";
    }

    function itemNoTurnoAtendimento(item, turnoKey) {
        if (turnoKey === "total") return true;
        const turno = turnosAtendimento.find((opcao) => opcao.key === turnoKey);
        if (!turno) return true;
        const segundosInicio = getHoraSegundos(item?.horaInicio || item?.inicio || item?.horaEnvio);
        if (segundosInicio < 0) return true;
        return segundosInicio >= turno.inicio && segundosInicio <= turno.fim;
    }

    function filtrarPorTurnoAtendimento(registros) {
        return registros.filter((item) => itemNoTurnoAtendimento(item, turnoAtendimentoAtual));
    }

    function calcularContagemRegiao(registros) {
        const contagem = Object.fromEntries(regioesBase.map((regiao) => [regiao, 0]));
        registros.forEach((registro) => {
            const zona = getZona(registro);
            if (contagem[zona] !== undefined) {
                contagem[zona]++;
            }
        });
        return contagem;
    }

    function ocorrenciaTemEquipeMtOuVt(ocorrencia) {
        const origemEquipe = ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe;
        return extrairCodigosEquipe(origemEquipe, "MT").length > 0 || extrairCodigosEquipe(origemEquipe, "VT").length > 0;
    }

    function calcularContagemRegiaoComEquipe(registros) {
        return calcularContagemRegiao(registros.filter(ocorrenciaTemEquipeMtOuVt));
    }

    function calcularContagemTipo(registros) {
        return registros.reduce((acc, ocorrencia) => {
            const tipoBase = getTipoBase(ocorrencia);
            acc[tipoBase] = (acc[tipoBase] || 0) + 1;
            return acc;
        }, {});
    }

    function formatarHoraComSegundos(hora) {
        const match = String(hora || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return "--:--:--";
        const horas = match[1].padStart(2, "0");
        const minutos = match[2].padStart(2, "0");
        const segundos = (match[3] || "00").padStart(2, "0");
        return `${horas}:${minutos}:${segundos}`;
    }

    function ordenarRecentes(a, b) {
        const timestampDiff = getTimestamp(b) - getTimestamp(a);
        if (timestampDiff) return timestampDiff;
        return getHoraMinutos(b.horaEnvio) - getHoraMinutos(a.horaEnvio);
    }

    function atualizarRelogio() {
        const agora = new Date();
        const relogio = document.getElementById("relogio");
        const dataAtual = document.getElementById("dataAtual");

        if (relogio) relogio.innerText = agora.toLocaleTimeString("pt-BR");
        if (dataAtual) {
            dataAtual.innerText = agora.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
        }
    }

    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);

    function agendarAtualizacaoMeiaNoite() {
        const agora = new Date();
        const proximaMeiaNoite = new Date(agora);
        proximaMeiaNoite.setDate(proximaMeiaNoite.getDate() + 1);
        proximaMeiaNoite.setHours(0, 0, 0, 0);

        const tempoAteMeiaNoite = proximaMeiaNoite.getTime() - agora.getTime();
        setTimeout(() => {
            window.location.reload();
        }, tempoAteMeiaNoite);
    }

    agendarAtualizacaoMeiaNoite();

    function calcularTempoAberto(horaEnvio) {
        if (!horaEnvio || !horaEnvio.includes(":")) return "Tempo desconhecido";

        const agora = new Date();
        const [horas, minutos] = horaEnvio.split(":").map(Number);
        const envio = new Date();
        envio.setHours(horas, minutos, 0, 0);

        let diffMs = agora - envio;
        if (diffMs < 0) {
            envio.setDate(envio.getDate() - 1);
            diffMs = agora - envio;
        }

        const diffMinutos = Math.floor(diffMs / 60000);
        const h = Math.floor(diffMinutos / 60);
        const m = diffMinutos % 60;

        if (h > 0) return `Aberta ha ${h}h e ${m}m`;
        return `Aberta ha ${m} minutos`;
    }

    function getTipoBase(ocorrencia) {
        return String(ocorrencia?.ocorrencia || "Sem natureza").split(" (")[0].trim() || "Sem natureza";
    }

    function getIconeTipoOcorrencia(tipo) {
        const chave = normalizarTexto(tipo).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return iconesTipoOcorrencia[chave] || "src/ocorrencias_painel.png";
    }

    function getZona(ocorrencia) {
        const referenciasZona = [
            ocorrencia?.classeRegiao,
            ocorrencia?.zonaClasse,
            ocorrencia?.className,
            ocorrencia?.zona,
            ocorrencia?.regiao
        ];
        if (referenciasZona.some((valor) => normalizarZona(valor) === "GERAL")) return "GERAL";
        return normalizarZona(referenciasZona.find((valor) => String(valor || "").trim()) || "SEM REGI\u00c3O");
    }

    function normalizarZona(valor) {
        const zona = normalizarTexto(valor);
        const zonaSemAcento = zona.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (zonaSemAcento.includes("GERAL") || zonaSemAcento.includes("REGIAO-GERAL")) return "GERAL";
        const numero = zonaSemAcento.match(/\b(?:REGIAO|ZONA|REGIAO-)\s*([1-6])\b/)?.[1];
        if (numero === "6") return "GERAL";
        if (numero) return `REGI\u00c3O ${numero}`;
        return zona;
    }

    function getClasseTipoLista(ocorrencia) {
        const tipo = normalizarTexto(ocorrencia?.ocorrencia).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (tipo.includes("SINISTRO")) return "tipo-sinistro";
        if (tipo.includes("ESTACIONAMENTO IRREGULAR")) return "tipo-estacionamento";
        return "tipo-padrao";
    }

    function getClasseZonaAtendimento(ocorrencia) {
        const zona = normalizarZona(getZona(ocorrencia));
        const numero = zona.match(/\b([1-5])\b/)?.[1];
        const origemEquipe = ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe;
        const temMt = extrairCodigosEquipe(origemEquipe, "MT").length > 0;
        const temVt = extrairCodigosEquipe(origemEquipe, "VT").length > 0;
        const classeZona = numero ? `zona-atendimento-${numero}` : zona === "GERAL" ? "zona-atendimento-geral" : "zona-atendimento-sem-regiao";
        const classeEquipe = temMt && temVt ? "equipe-mt equipe-vt" : temMt ? "equipe-mt" : temVt ? "equipe-vt" : "equipe-sem-equipe";
        return `${classeZona} ${classeEquipe}`;
    }

    function atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes) {
        ultimosDocsHoje = docsHoje;
        ultimosDocsAtivosAgentes = docsAtivosAgentes;
        ultimosDocsHistoricoAgentes = docsHistoricoAgentes;

        const mapaUnico = new Map();
        docsPendentes.forEach((item) => mapaUnico.set(item.id, item));
        docsHoje.forEach((item) => mapaUnico.set(item.id, item));

        const todas = Array.from(mapaUnico.values());
        const hoje = todas.filter((ocorrencia) => ocorrencia.data_filtro === dataFiltro);
        const ativas = todas.filter(isAtivaNoPainelPendentes).sort(ordenarRecentes);
        ultimasOcorrenciasAtivas = ativas;
        const concluidasHoje = hoje.filter(isConcluida);
        const qtdDespacho = ativas.filter((ocorrencia) => STATUS_DESPACHO.has(normalizarTexto(ocorrencia.situacao))).length;
        const qtdAndamento = ativas.filter((ocorrencia) => STATUS_EM_ANDAMENTO.has(normalizarTexto(ocorrencia.situacao))).length;

        const docsAtivosAgentesTurno = filtrarPorTurnoAtendimento(docsAtivosAgentes);
        const hojeTurno = filtrarPorTurnoAtendimento(hoje);
        const ativasTurno = filtrarPorTurnoAtendimento(ativas);
        const ativasHojeTurno = ativasTurno.filter((ocorrencia) => ocorrencia.data_filtro === dataFiltro);
        const contagemTipo = calcularContagemTipo(hojeTurno);
        const contagemRegiaoHoje = calcularContagemRegiao(hojeTurno);
        const contagemRegiaoAtivas = calcularContagemRegiaoComEquipe(ativasTurno);
        const frotaAtivaPorRegiao = calcularFrotaOcorrenciasPorRegiao(ativasTurno);
        const frotaOcorrenciasHoje = calcularFrotaOcorrencias(hojeTurno);
        const frotaOcorrenciasHojePorRegiao = calcularFrotaOcorrenciasPorRegiaoPeriodo(hojeTurno);
        const docsHistoricoTurno = filtrarPorTurnoAtendimento(docsHistoricoAgentes);
        const agentesPorRegiao = calcularAgentesPorRegiao(docsAtivosAgentesTurno, ativasTurno, docsHistoricoTurno);
        const frotaDisponivelPainel = calcularFrotaDisponivelPainel(agentesPorRegiao);

        atualizarResumoAtendimento(ativasHojeTurno.length);
        atualizarIndicadoresKpi(hoje.length, qtdDespacho, qtdAndamento, concluidasHoje.length, frotaDisponivelPainel);
        atualizarListaAtivas(ativasHojeTurno.filter((ocorrencia) => ocorrencia.data_filtro === dataFiltro));
        atualizarGraficos(
            contagemRegiaoAtivas,
            contagemRegiaoHoje,
            contagemTipo,
            frotaAtivaPorRegiao,
            frotaOcorrenciasHoje,
            frotaOcorrenciasHojePorRegiao,
            hojeTurno,
            criarMapaNomesAgentes(docsAtivosAgentes, docsHistoricoAgentes),
            agentesPorRegiao
        );
    }

    function atualizarIndicadoresKpi(total, despacho, andamento, concluidas, frota) {
        const pares = [
            ["kpiTotal", total],
            ["kpiDespacho", despacho],
            ["kpiAndamento", andamento],
            ["kpiConcluidas", concluidas]
        ];

        pares.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(valor ?? 0);
        });

        atualizarKpiFrota(frota);

        const acionarAlertaKpi = (id) => {
            const card = document.getElementById(id)?.closest(".kpi-card");
            if (!card) return;
            card.classList.remove("kpi-alert");
            void card.offsetWidth;
            card.classList.add("kpi-alert");
        };

        const houveLeituraAnterior = kpiValoresAnteriores.despacho !== null;
        if (houveLeituraAnterior && kpiValoresAnteriores.despacho === 0 && despacho > 0) {
            acionarAlertaKpi("kpiDespacho");
        }
        if (houveLeituraAnterior && andamento > 0 && andamento !== kpiValoresAnteriores.andamento) {
            acionarAlertaKpi("kpiAndamento");
        }
        if (houveLeituraAnterior && concluidas > 0 && concluidas !== kpiValoresAnteriores.concluidas) {
            acionarAlertaKpi("kpiConcluidas");
        }

        kpiValoresAnteriores.total = total;
        kpiValoresAnteriores.despacho = despacho;
        kpiValoresAnteriores.andamento = andamento;
        kpiValoresAnteriores.concluidas = concluidas;
    }

    function atualizarKpiFrota(frota) {
        const totalFrota = (frota?.mt || 0) + (frota?.vt || 0);
        const frotaEl = document.getElementById("kpiVtrs");
        if (frotaEl) {
            frotaEl.innerHTML = `
                <span class="fleet-value fleet-mt"><img class="fleet-icon" src="src/mt_png.png" alt="MT"><span class="fleet-count">${frota?.mt || 0}</span></span>
                <span class="fleet-value fleet-vt"><img class="fleet-icon" src="src/vt_png.png" alt="VT"><span class="fleet-count">${frota?.vt || 0}</span></span>
            `;
            frotaEl.setAttribute("aria-label", `${totalFrota} motos e viaturas disponiveis em campo`);
        }
        kpiValoresAnteriores.frota = totalFrota;
    }

    function atualizarResumoAtendimento(qtdAtivas) {
        const bloco = document.getElementById("activeLiveSummary");
        if (!bloco) return;
        const numero = bloco.querySelector("strong");
        if (numero) numero.textContent = String(qtdAtivas);
    }

    function getTextoCampo(item, chaves) {
        for (const chave of chaves) {
            const valor = item?.[chave];
            if (valor === null || valor === undefined || valor === "") continue;
            if (Array.isArray(valor)) {
                const textoArray = valor.map((parte) => String(parte || "").trim()).filter(Boolean).join(", ");
                if (textoArray) return textoArray;
                continue;
            }
            return String(valor).trim();
        }
        return "";
    }

    function extrairAgentes(item) {
        const candidato = getTextoCampo(item, ["nomes", "nome", "nomeCompleto", "nomeAgente", "agente", "responsavel", "motorista", "operador", "usuario", "equipe"]);
        if (!candidato) return [];
        return candidato.split(/[\n\r,;/|]+/).map((parte) => parte.trim()).filter(Boolean);
    }

    function normalizarCodigoEquipe(codigo, tipoPadrao = "") {
        const texto = String(codigo || "").toUpperCase();
        const match = texto.match(/\b(MT|VT)\s*[- Nº°]*\s*(\d{1,4})\b/);
        if (match) return `${match[1]} ${match[2].padStart(2, "0")}`;
        if (tipoPadrao) {
            const numero = texto.match(/\b(\d{1,4})\b/)?.[1];
            if (numero) return `${tipoPadrao} ${numero.padStart(2, "0")}`;
        }
        return texto.replace(/\s+/g, " ").trim();
    }

    function extrairCodigosEquipe(veiculo, tipo) {
        const texto = Array.isArray(veiculo) ? veiculo.join(" ") : String(veiculo || "");
        const normalizado = texto.toUpperCase();
        if (!new RegExp(`\\b${tipo}\\b`, "i").test(normalizado)) return [];
        const codigosComTipo = [...texto.matchAll(new RegExp(`\\b${tipo}\\s*[- Nº°]*\\s*(\\d{1,4})\\b`, "gi"))]
            .map((match) => normalizarCodigoEquipe(`${tipo} ${match[1]}`, tipo));
        if (codigosComTipo.length) return [...new Set(codigosComTipo)];
        return [tipo];
    }

    function calcularFrotaAtiva(docsAtivosAgentes) {
        return docsAtivosAgentes.reduce((acc, item) => {
            const veiculo = normalizarTexto(item?.veiculo);
            if (veiculo.startsWith("MT")) acc.mt += 1;
            if (veiculo.startsWith("VT")) acc.vt += 1;
            return acc;
        }, { mt: 0, vt: 0 });
    }

    function calcularFrotaPorRegiao(docsAtivosAgentes) {
        const base = Object.fromEntries(regioesBase.map((regiao) => [regiao, { mt: 0, vt: 0 }]));

        docsAtivosAgentes.forEach((item) => {
            const veiculo = normalizarTexto(item?.veiculo);
            const zona = getZona(item);
            if (!base[zona]) return;
            if (veiculo.startsWith("MT")) base[zona].mt += 1;
            if (veiculo.startsWith("VT")) base[zona].vt += 1;
        });

        return base;
    }

    function equipeContabilizavelPainel(equipe) {
        const disponivelSmartwall = Array.isArray(equipe) ? true : equipe?.disponivelSmartwall !== false;
        return disponivelSmartwall;
    }

    function calcularFrotaDisponivelPainel(agentesPorRegiao) {
        return Object.values(agentesPorRegiao || {}).reduce((acc, regiao) => {
            acc.mt += (regiao?.mt || []).filter(equipeContabilizavelPainel).length;
            acc.vt += (regiao?.vt || []).filter(equipeContabilizavelPainel).length;
            return acc;
        }, { mt: 0, vt: 0 });
    }

    function calcularFrotaOcorrencias(ocorrenciasAtivas) {
        const codigosMt = new Set();
        const codigosVt = new Set();

        ocorrenciasAtivas.forEach((ocorrencia) => {
            extrairCodigosEquipe(ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe, "MT").forEach((codigo) => codigosMt.add(codigo));
            extrairCodigosEquipe(ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe, "VT").forEach((codigo) => codigosVt.add(codigo));
        });

        return { mt: codigosMt.size, vt: codigosVt.size };
    }

    function calcularFrotaOcorrenciasPorRegiao(ocorrenciasAtivas) {
        const setsPorRegiao = Object.fromEntries(regioesBase.map((regiao) => [regiao, { mt: new Set(), vt: new Set() }]));
        const codigosMt = new Set();
        const codigosVt = new Set();

        ocorrenciasAtivas.forEach((ocorrencia) => {
            const zona = getZona(ocorrencia);
            if (!setsPorRegiao[zona]) return;
            const origemEquipe = ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe;
            extrairCodigosEquipe(origemEquipe, "MT").forEach((codigo) => {
                if (codigosMt.has(codigo)) return;
                setsPorRegiao[zona].mt.add(codigo);
                codigosMt.add(codigo);
            });
            extrairCodigosEquipe(origemEquipe, "VT").forEach((codigo) => {
                if (codigosVt.has(codigo)) return;
                setsPorRegiao[zona].vt.add(codigo);
                codigosVt.add(codigo);
            });
        });

        return Object.fromEntries(regioesBase.map((regiao) => [
            regiao,
            {
                mt: setsPorRegiao[regiao].mt.size,
                vt: setsPorRegiao[regiao].vt.size
            }
        ]));
    }

    function calcularFrotaOcorrenciasPorRegiaoPeriodo(ocorrenciasPeriodo) {
        const setsPorRegiao = Object.fromEntries(regioesBase.map((regiao) => [regiao, { mt: new Set(), vt: new Set() }]));

        ocorrenciasPeriodo.forEach((ocorrencia) => {
            const zona = getZona(ocorrencia);
            if (!setsPorRegiao[zona]) return;
            const origemEquipe = ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe;
            extrairCodigosEquipe(origemEquipe, "MT").forEach((codigo) => setsPorRegiao[zona].mt.add(codigo));
            extrairCodigosEquipe(origemEquipe, "VT").forEach((codigo) => setsPorRegiao[zona].vt.add(codigo));
        });

        return Object.fromEntries(regioesBase.map((regiao) => [
            regiao,
            {
                mt: setsPorRegiao[regiao].mt.size,
                vt: setsPorRegiao[regiao].vt.size
            }
        ]));
    }

    function calcularAgentesPorRegiao(docsAtivosAgentes, ocorrenciasAtivas = [], docsHistoricoAgentes = []) {
        const ocorrenciasPorEquipe = new Map();
        const codigosEmOcorrencia = new Set();
        ocorrenciasAtivas.forEach((ocorrencia) => {
            const origemEquipe = ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe;
            const codigos = [
                ...extrairCodigosEquipe(origemEquipe, "VT"),
                ...extrairCodigosEquipe(origemEquipe, "MT")
            ];
            [...new Set(codigos)].forEach((codigo) => {
                const lista = ocorrenciasPorEquipe.get(codigo) || [];
                lista.push(ocorrencia);
                ocorrenciasPorEquipe.set(codigo, lista);
                codigosEmOcorrencia.add(codigo);
            });
        });

        const base = Object.fromEntries(regioesBase.map((regiao) => [regiao, { mt: [], vt: [] }]));
        const equipesAtivasPorCodigo = new Map();
        const equipesPainelPorChave = new Map();

        const registrarEquipePainel = (tipo, codigo, zona, dados = {}) => {
            if (!base[zona]) return;
            const chave = `${tipo}:${codigo}`;
            const existente = equipesPainelPorChave.get(chave);
            const nomes = [...new Set([...(existente?.nomes || []), ...(dados.nomes || [])])];

            if (existente) {
                existente.nomes = nomes;
                existente.disponivelSmartwall = existente.disponivelSmartwall !== false && dados.disponivelSmartwall !== false;
                existente.motivoIndisponibilidadeSmartwall = dados.motivoIndisponibilidadeSmartwall || existente.motivoIndisponibilidadeSmartwall || "";
                existente.ocorrencias = [...new Set([...(existente.ocorrencias || []), ...(dados.ocorrencias || [])])];
                existente.atendimentoStatus = existente.atendimentoStatus === "andamento" || dados.atendimentoStatus === "andamento"
                    ? "andamento"
                    : existente.atendimentoStatus || dados.atendimentoStatus || "historico";
                existente.historicoSmartwall = Boolean(existente.historicoSmartwall && dados.historicoSmartwall);
                return;
            }

            const equipe = {
                codigo,
                nomes,
                disponivelSmartwall: dados.disponivelSmartwall !== false,
                motivoIndisponibilidadeSmartwall: dados.motivoIndisponibilidadeSmartwall || "",
                ocorrencias: dados.ocorrencias || [],
                atendimentoStatus: dados.atendimentoStatus || "historico",
                historicoSmartwall: Boolean(dados.historicoSmartwall)
            };
            const destino = tipo === "MT" ? base[zona].mt : base[zona].vt;
            destino.push(equipe);
            equipesPainelPorChave.set(chave, equipe);
        };

        docsAtivosAgentes.forEach((item) => {
            const nomes = [...new Set(extrairAgentes(item))];
            const disponivelSmartwall = item?.disponivelSmartwall !== false;
            const motivoIndisponibilidadeSmartwall = item?.motivoIndisponibilidadeSmartwall || "";

            ["VT", "MT"].forEach((tipo) => {
                extrairCodigosEquipe(item?.veiculo || item?.equipe || item?.codigoEquipe, tipo).forEach((codigo) => {
                    const atual = equipesAtivasPorCodigo.get(codigo);
                    equipesAtivasPorCodigo.set(codigo, {
                        codigo,
                        tipo,
                        zona: atual?.zona || getZona(item),
                        nomes: [...new Set([...(atual?.nomes || []), ...nomes])],
                        disponivelSmartwall: atual ? atual.disponivelSmartwall !== false && disponivelSmartwall : disponivelSmartwall,
                        motivoIndisponibilidadeSmartwall: motivoIndisponibilidadeSmartwall || atual?.motivoIndisponibilidadeSmartwall || ""
                    });
                });
            });
        });

        const codigosRegistrados = new Set();
        equipesAtivasPorCodigo.forEach((equipeAtiva, codigo) => {
            const zona = equipeAtiva.zona;
            if (!base[zona] || codigosEmOcorrencia.has(codigo)) return;
            registrarEquipePainel(equipeAtiva.tipo, codigo, zona, {
                nomes: equipeAtiva.nomes || [],
                disponivelSmartwall: equipeAtiva.disponivelSmartwall !== false,
                motivoIndisponibilidadeSmartwall: equipeAtiva.motivoIndisponibilidadeSmartwall || "",
                ocorrencias: [],
                atendimentoStatus: "despacho"
            });
            codigosRegistrados.add(`${equipeAtiva.tipo}:${codigo}`);
        });

        ocorrenciasAtivas.forEach((ocorrencia) => {
            const zona = getZona(ocorrencia);
            if (!base[zona]) return;
            const origemEquipe = ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe;
            const atendimentoStatus = normalizarTexto(ocorrencia?.situacao) === "EM ANDAMENTO" ? "andamento" : "despacho";

            extrairCodigosEquipe(origemEquipe, "VT").forEach((codigo) => {
                const chave = `VT:${codigo}`;
                if (codigosRegistrados.has(chave)) return;
                const equipeAtiva = equipesAtivasPorCodigo.get(codigo) || {};
                registrarEquipePainel("VT", codigo, zona, {
                    nomes: equipeAtiva.nomes || [],
                    disponivelSmartwall: equipeAtiva.disponivelSmartwall !== false,
                    motivoIndisponibilidadeSmartwall: equipeAtiva.motivoIndisponibilidadeSmartwall || "",
                    ocorrencias: ocorrenciasPorEquipe.get(codigo) || [ocorrencia],
                    atendimentoStatus
                });
                codigosRegistrados.add(chave);
            });

            extrairCodigosEquipe(origemEquipe, "MT").forEach((codigo) => {
                const chave = `MT:${codigo}`;
                if (codigosRegistrados.has(chave)) return;
                const equipeAtiva = equipesAtivasPorCodigo.get(codigo) || {};
                registrarEquipePainel("MT", codigo, zona, {
                    nomes: equipeAtiva.nomes || [],
                    disponivelSmartwall: equipeAtiva.disponivelSmartwall !== false,
                    motivoIndisponibilidadeSmartwall: equipeAtiva.motivoIndisponibilidadeSmartwall || "",
                    ocorrencias: ocorrenciasPorEquipe.get(codigo) || [ocorrencia],
                    atendimentoStatus
                });
                codigosRegistrados.add(chave);
            });
        });

        docsHistoricoAgentes.forEach((item) => {
            const zona = getZona(item);
            if (!base[zona]) return;
            const nomes = [...new Set(extrairAgentes(item))];
            ["VT", "MT"].forEach((tipo) => {
                extrairCodigosEquipe(item?.veiculo || item?.equipe || item?.codigoEquipe, tipo).forEach((codigo) => {
                    registrarEquipePainel(tipo, codigo, zona, {
                        nomes,
                        disponivelSmartwall: true,
                        ocorrencias: [],
                        atendimentoStatus: "historico",
                        historicoSmartwall: true
                    });
                });
            });
        });

        return base;
    }

    function criarMapaNomesAgentes(...listas) {
        const mapa = new Map();

        listas.flat().filter(Boolean).forEach((item) => {
            const nomes = [...new Set(extrairAgentes(item).filter(Boolean))];
            if (!nomes.length) return;
            ["VT", "MT"].forEach((tipo) => {
                extrairCodigosEquipe(item?.veiculo || item?.equipe || item?.codigoEquipe, tipo).forEach((codigo) => {
                    const atuais = mapa.get(codigo) || [];
                    mapa.set(codigo, [...new Set([...atuais, ...nomes])]);
                });
            });
        });

        return mapa;
    }

    function nomeZona(regiao, index) {
        if (normalizarZona(regiao) === "GERAL") return "GERAL";
        const numero = String(regiao).match(/\d+/)?.[0] || String(index + 1);
        return `ZONA ${numero}`;
    }

    function atualizarListaAtivas(ativas) {
        const divLista = document.getElementById("listaAtivas");
        if (!divLista) return;

        divLista.innerHTML = "";
        ocorrenciasModal.clear();

        if (ativas.length === 0) {
            divLista.innerHTML = '<div class="empty-state">Nenhuma ocorrencia ativa registrada hoje.</div>';
            kpiValoresAnteriores.listaInicializada = true;
            return;
        }

        const ativasOrdenadas = [...ativas].sort((a, b) => getHoraMinutos(b.horaEnvio) - getHoraMinutos(a.horaEnvio));

        ativasOrdenadas.slice(0, 8).forEach((ocorrencia) => {
            const situacao = normalizarTexto(ocorrencia.situacao);
            const statusClass = STATUS_DESPACHO.has(situacao) ? "despacho" :
                STATUS_EM_ANDAMENTO.has(situacao) ? "encaminhada" :
                isConcluida(ocorrencia) ? "concluida" : "";
            const modalId = ocorrencia.id || String(ocorrenciasModal.size);
            ocorrenciasModal.set(modalId, ocorrencia);
            const alertaEncaminhada = kpiValoresAnteriores.listaInicializada &&
                statusClass === "encaminhada" &&
                !kpiValoresAnteriores.encaminhadas.has(modalId);
            if (statusClass === "encaminhada") kpiValoresAnteriores.encaminhadas.add(modalId);
            const horaEnvio = formatarHoraComSegundos(ocorrencia.horaEnvio);
            const tipoClass = getClasseTipoLista(ocorrencia);
            const zonaClass = getClasseZonaAtendimento(ocorrencia);

            divLista.insertAdjacentHTML("beforeend", `
                <button type="button" class="list-item ${statusClass} ${tipoClass} ${zonaClass} ${alertaEncaminhada ? "list-alert" : ""}" data-modal-id="${escapeHtml(modalId)}">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="item-hora">${escapeHtml(horaEnvio)}</span>
                    <span class="item-tipo">${escapeHtml(ocorrencia.ocorrencia || "Sem natureza")}</span>
                    <span class="item-action" aria-hidden="true"></span>
                </button>
            `);
        });

        kpiValoresAnteriores.listaInicializada = true;
    }

    function abrirModalRegistro(ocorrencia) {
        const modal = document.getElementById("smartRegistroModal");
        const content = document.getElementById("smartModalContent");
        const title = document.getElementById("smartModalTitle");
        if (!modal || !content || !ocorrencia) return;
        if (title) title.textContent = "Detalhes da ocorr\u00eancia";

        const campos = [
            ["N\u00ba Registro", ocorrencia.numRegistro || ocorrencia.numeroRegistro || "-"],
            ["Situa\u00e7\u00e3o", ocorrencia.situacao || "-"],
            ["Ocorr\u00eancia", ocorrencia.ocorrencia || "-"],
            ["Regi\u00e3o", getZona(ocorrencia)],
            ["Hora envio", formatarHoraComSegundos(ocorrencia.horaEnvio)],
            ["Tempo aberto", calcularTempoAberto(ocorrencia.horaEnvio)],
            ["Equipe(s)", ocorrencia.equipe || "-"],
            ["Local", ocorrencia.local || "-"],
            ["Detalhe", ocorrencia.detalhamento || ocorrencia.detalhe || "-"]
        ];

        campos[0][0] = "N\u00ba Registro";
        campos[1][0] = "Situa\u00e7\u00e3o";
        campos[2][0] = "Ocorr\u00eancia";
        campos[3][0] = "Regi\u00e3o";

        content.innerHTML = campos.map(([label, valor]) => `
            <div class="smart-modal-field">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(valor)}</span>
            </div>
        `).join("");

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function formatarDataOcorrencia(ocorrencia) {
        const data = String(ocorrencia?.data_filtro || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data.split("-").reverse().join("/");
        return data || "-";
    }

    function formatarCodigoEquipeExibicao(codigo) {
        const match = String(codigo || "").match(/\b(MT|VT)\s*(\d{1,4})\b/i);
        if (!match) return String(codigo || "-").trim() || "-";
        return `${match[1].toUpperCase()}-${match[2].padStart(2, "0")}`;
    }

    function criarLinhasEquipeOcorrencia(ocorrencia, mapaNomesAgentes) {
        const equipeOriginal = String(ocorrencia?.equipe || ocorrencia?.veiculo || ocorrencia?.codigoEquipe || "").trim();
        const codigosEquipe = [
            ...extrairCodigosEquipe(equipeOriginal, "VT").map((codigo) => ({ codigo, tipoEquipe: "VT" })),
            ...extrairCodigosEquipe(equipeOriginal, "MT").map((codigo) => ({ codigo, tipoEquipe: "MT" }))
        ];
        const nomesCampos = getTextoCampo(ocorrencia, ["nomes", "nome", "nomeCompleto", "nomeAgente", "agente", "responsavel", "motorista", "operador", "usuario"])
            .split(/[\n\r,;/|]+/)
            .map((nome) => nome.trim())
            .filter(Boolean);

        if (!codigosEquipe.length) {
            return [{
                equipe: equipeOriginal || "-",
                tipoEquipe: "-",
                agentes: nomesCampos.length ? nomesCampos : []
            }];
        }

        return codigosEquipe.map(({ codigo, tipoEquipe }) => {
            const nomesMapa = mapaNomesAgentes.get(codigo) || [];
            const agentes = [...new Set([...nomesMapa, ...nomesCampos])];
            return {
                equipe: formatarCodigoEquipeExibicao(codigo),
                tipoEquipe,
                agentes
            };
        });
    }

    function criarHistoricoRegiao(registros, mapaNomesAgentes = new Map()) {
        const grupos = new Map();

        registros.forEach((ocorrencia) => {
            const equipes = criarLinhasEquipeOcorrencia(ocorrencia, mapaNomesAgentes);
            const item = {
                tipo: getTipoBase(ocorrencia),
                data: formatarDataOcorrencia(ocorrencia),
                hora: formatarHoraComSegundos(ocorrencia?.horaEnvio),
                equipes
            };
            const chaveOcorrencia = ocorrencia?.id || ocorrencia?.numRegistro || ocorrencia?.numeroRegistro || [
                item.tipo,
                item.data,
                item.hora,
                String(ocorrencia?.local || ""),
                String(ocorrencia?.detalhamento || ocorrencia?.detalhe || "")
            ].join("|");
            const atual = grupos.get(chaveOcorrencia) || { ...item, quantidade: 0 };
            atual.quantidade += 1;
            grupos.set(chaveOcorrencia, atual);
        });

        return [...grupos.values()].sort((a, b) => {
            const horaA = getHoraSegundos(a.hora);
            const horaB = getHoraSegundos(b.hora);
            return horaB - horaA || a.tipo.localeCompare(b.tipo, "pt-BR");
        });
    }

    function renderizarEquipeHistorico(equipe) {
        const nomes = Array.isArray(equipe.agentes) && equipe.agentes.length ? equipe.agentes : [equipe.equipe].filter(Boolean);
        return `
            <span class="smart-history-team-card region-agent-group">
                <span>
                    <span class="region-agent-code">${escapeHtml(equipe.equipe || "-")}</span>
                    ${nomes.map((nome) => `
                        <span class="region-agent-name region-agent-name-available" title="${escapeHtml(nome)}">${escapeHtml(formatarNomeEquipe(nome))}</span>
                    `).join("")}
                </span>
            </span>
        `;
    }

    function abrirModalRegiaoGrafico(regiao, registros, frota, mapaNomesAgentes) {
        const modal = document.getElementById("smartRegistroModal");
        const content = document.getElementById("smartModalContent");
        const title = document.getElementById("smartModalTitle");
        if (!modal || !content) return;

        const historico = criarHistoricoRegiao(registros, mapaNomesAgentes);
        const totalOcorrencias = registros.length;

        if (title) title.textContent = `Hist\u00f3rico - ${regiao}`;
        content.innerHTML = `
            <div class="smart-region-history">
                <div class="smart-region-summary">
                    <span><strong>${escapeHtml(totalOcorrencias)}</strong> ocorr\u00eancias</span>
                    <span><strong>${escapeHtml(frota?.vt || 0)}</strong> VT</span>
                    <span><strong>${escapeHtml(frota?.mt || 0)}</strong> MT</span>
                </div>
                <div class="smart-region-history-list">
                    <div class="smart-region-history-head">
                        <span>Tipo</span>
                        <span>Data</span>
                        <span>Hor\u00e1rio</span>
                        <span>Equipes</span>
                        <span>Qtd.</span>
                    </div>
                    ${historico.length ? historico.map((item) => `
                        <div class="smart-region-history-row">
                            <span class="smart-region-history-type">${escapeHtml(item.tipo)}</span>
                            <span>${escapeHtml(item.data)}</span>
                            <span>${escapeHtml(item.hora)}</span>
                            <span class="smart-region-history-teams">${item.equipes.map(renderizarEquipeHistorico).join("")}</span>
                            <span class="smart-region-history-count">${escapeHtml(item.quantidade)}</span>
                        </div>
                    `).join("") : '<div class="smart-region-history-empty">Nenhum registro para o per\u00edodo filtrado.</div>'}
                </div>
            </div>
        `;

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function abrirModalMotivoIndisponibilidade(nome, motivo, codigo) {
        const modal = document.getElementById("smartRegistroModal");
        const content = document.getElementById("smartModalContent");
        const title = document.getElementById("smartModalTitle");
        if (!modal || !content) return;

        if (title) title.textContent = "Motivo da indisponibilidade";
        content.innerHTML = `
            <div class="smart-modal-field smart-modal-field-wide">
                <strong>Agente</strong>
                <span>${escapeHtml(nome || "-")}</span>
            </div>
            <div class="smart-modal-field">
                <strong>Equipe</strong>
                <span>${escapeHtml(codigo || "-")}</span>
            </div>
            <div class="smart-modal-field smart-modal-field-wide">
                <strong>Motivo</strong>
                <span>${escapeHtml(motivo || "Motivo n\u00e3o informado")}</span>
            </div>
        `;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function fecharModalRegistro() {
        const modal = document.getElementById("smartRegistroModal");
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    document.addEventListener("click", (event) => {
        const nomeIndisponivel = event.target.closest(".region-agent-name-reason");
        if (nomeIndisponivel) {
            abrirModalMotivoIndisponibilidade(
                nomeIndisponivel.dataset.agentName,
                nomeIndisponivel.dataset.reason,
                nomeIndisponivel.dataset.codigo
            );
            return;
        }

        const filtroTurno = event.target.closest(".shift-filter-btn[data-shift]");
        if (filtroTurno) {
            turnoAtendimentoAtual = filtroTurno.dataset.shift;
            renderizarFiltroTurnos();
            const hojeTurno = filtrarPorTurnoAtendimento(ultimosDocsHoje);
            const ativosAgentesTurno = filtrarPorTurnoAtendimento(ultimosDocsAtivosAgentes);
            const historicoAgentesTurno = filtrarPorTurnoAtendimento(ultimosDocsHistoricoAgentes);
            const ocorrenciasAtivasTurno = filtrarPorTurnoAtendimento(ultimasOcorrenciasAtivas);
            const agentesPorRegiaoTurno = calcularAgentesPorRegiao(ativosAgentesTurno, ocorrenciasAtivasTurno, historicoAgentesTurno);
            const frotaAtivaPorRegiao = calcularFrotaOcorrenciasPorRegiao(ocorrenciasAtivasTurno);
            const contagemRegiaoAtivas = calcularContagemRegiaoComEquipe(ocorrenciasAtivasTurno);
            ultimaContagemRegiaoAtivas = contagemRegiaoAtivas;
            atualizarResumoAtendimento(ocorrenciasAtivasTurno.length);
            atualizarKpiFrota(calcularFrotaDisponivelPainel(agentesPorRegiaoTurno));
            atualizarListaAtivas(ocorrenciasAtivasTurno.filter((ocorrencia) => ocorrencia.data_filtro === dataFiltro));
            atualizarGraficos(
                contagemRegiaoAtivas,
                calcularContagemRegiao(hojeTurno),
                calcularContagemTipo(hojeTurno),
                frotaAtivaPorRegiao,
                calcularFrotaOcorrencias(hojeTurno),
                calcularFrotaOcorrenciasPorRegiaoPeriodo(hojeTurno),
                hojeTurno,
                criarMapaNomesAgentes(ultimosDocsAtivosAgentes, ultimosDocsHistoricoAgentes),
                agentesPorRegiaoTurno
            );
            return;
        }

        const item = event.target.closest(".list-item[data-modal-id]");
        if (item) {
            abrirModalRegistro(ocorrenciasModal.get(item.dataset.modalId));
            return;
        }

        const zonaToggle = event.target.closest(".region-zone-toggle[data-zone-key]");
        if (zonaToggle) {
            const zoneKey = zonaToggle.dataset.zoneKey;
            if (zonasAtendimentoRecolhidas.has(zoneKey)) {
                zonasAtendimentoRecolhidas.delete(zoneKey);
            } else {
                zonasAtendimentoRecolhidas.add(zoneKey);
            }

            const recolhida = zonasAtendimentoRecolhidas.has(zoneKey);
            const row = zonaToggle.closest(".region-ranking-row");
            row?.classList.toggle("region-ranking-row-collapsed", recolhida);
            zonaToggle.setAttribute("aria-expanded", String(!recolhida));
            return;
        }

        if (event.target.closest("[data-close-smart-modal]")) {
            fecharModalRegistro();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") fecharModalRegistro();
    });

    function atualizarGraficos(dadosRegiaoAtivas, dadosRegiaoHoje, dadosTipo, frotaAtivaPorRegiao, frotaOcorrenciasHoje, frotaOcorrenciasHojePorRegiao, ocorrenciasPeriodo, mapaNomesAgentes, agentesAtivosPorRegiao) {
        atualizarGraficoRegioes(dadosRegiaoAtivas, dadosRegiaoHoje, frotaAtivaPorRegiao, frotaOcorrenciasHoje, frotaOcorrenciasHojePorRegiao, ocorrenciasPeriodo, mapaNomesAgentes, agentesAtivosPorRegiao);
        atualizarGraficoTipos(dadosTipo);
    }

    function renderizarFiltroTurnos() {
        const filtro = document.getElementById("shiftFilter");
        if (!filtro) return;

        filtro.innerHTML = turnosAtendimento.map((turno) => `
            <button type="button" class="shift-filter-btn ${turnoAtendimentoAtual === turno.key ? "active" : ""}" data-shift="${turno.key}" style="--shift-color: ${turno.color}">
                <span class="shift-filter-icon" aria-hidden="true">${obterIconeTurno(turno.key)}</span>
                <strong>${turno.label}</strong>
            </button>
        `).join("");
    }

    function obterIconeTurno(key) {
        const icones = {
            total: `<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 20V10"/><path d="M12 20V5"/><path d="M18 20v-8"/><path d="M4 12h3"/><path d="M10 7h3"/><path d="M16 14h3"/></svg>`,
            manha: `<svg viewBox="0 0 24 24"><path d="M4 18h16"/><path d="M7 15a5 5 0 0 1 10 0"/><path d="M12 4v3"/><path d="M5.6 7.6l2.1 2.1"/><path d="M18.4 7.6l-2.1 2.1"/><path d="M3 15h2"/><path d="M19 15h2"/></svg>`,
            tarde: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.9 4.9 7 7"/><path d="M17 17l2.1 2.1"/><path d="M19.1 4.9 17 7"/><path d="M7 17l-2.1 2.1"/></svg>`,
            noite: `<svg viewBox="0 0 24 24"><path d="M19 15.6A7.5 7.5 0 0 1 8.4 5a8 8 0 1 0 10.6 10.6Z"/><path d="M17 3l.6 1.4L19 5l-1.4.6L17 7l-.6-1.4L15 5l1.4-.6Z"/></svg>`,
            corujao: `<svg viewBox="0 0 24 24"><path d="M7 7 4 4v7a8 8 0 0 0 16 0V4l-3 3"/><circle cx="9" cy="11" r="1.7"/><circle cx="15" cy="11" r="1.7"/><path d="M10.5 16 12 17l1.5-1"/><path d="M8 20 6 22"/><path d="M16 20l2 2"/></svg>`
        };
        return icones[key] || icones.total;
    }

    function renderizarRankingGraficoRegiao(labels, frotaPorRegiao, agentesPorRegiao, ocorrenciasPorRegiao = {}) {
        const legend = document.getElementById("regionRankingPanel");
        if (!legend) return;
        const linhas = labels.map((regiao, index) => {
            const agentes = agentesPorRegiao?.[regiao] || { mt: [], vt: [] };
            const agentesMt = agentes.mt || [];
            const agentesVt = agentes.vt || [];
            const totalMtPainel = agentesMt.filter(equipeContabilizavelPainel).length;
            const totalVtPainel = agentesVt.filter(equipeContabilizavelPainel).length;
            const total = totalMtPainel + totalVtPainel;
            return {
                regiao,
                zona: nomeZona(regiao, index),
                numero: index + 1,
                total,
                mt: totalMtPainel,
                vt: totalVtPainel,
                ocorrencias: ocorrenciasPorRegiao?.[regiao] || 0,
                agentesMt,
                agentesVt,
                cor: coresPainelRegiao[index] || "#2f86ff",
                zoneKey: normalizarZona(regiao)
            };
        });
        const totalGeral = linhas.reduce((acc, item) => acc + item.total, 0);
        const totalMt = linhas.reduce((acc, item) => acc + item.mt, 0);
        const totalVt = linhas.reduce((acc, item) => acc + item.vt, 0);
        linhas.forEach((item) => {
            item.percentual = totalGeral ? ((item.total / totalGeral) * 100).toFixed(1).replace(".", ",") : "0,0";
            item.temEquipe = item.agentesMt.length > 0 || item.agentesVt.length > 0;
            item.temEquipeEmAndamento = [...item.agentesMt, ...item.agentesVt]
                .some((equipe) => !Array.isArray(equipe) && equipe.atendimentoStatus === "andamento");
            const ocorrenciasEquipe = [...item.agentesMt, ...item.agentesVt]
                .flatMap((equipe) => Array.isArray(equipe) ? [] : equipe.ocorrencias || []);
            const ocorrenciasEquipeAndamento = ocorrenciasEquipe.filter((ocorrencia) => normalizarTexto(ocorrencia?.situacao) === "EM ANDAMENTO");
            const ocorrenciasEquipeAndamentoUnicas = new Set(ocorrenciasEquipeAndamento.map((ocorrencia, indice) => ocorrencia?.id || `${getTimestamp(ocorrencia)}-${ocorrencia?.numRegistro || ocorrencia?.numeroRegistro || indice}`));
            item.temEquipeAtendendo = item.temEquipeEmAndamento || ocorrenciasEquipeAndamentoUnicas.size > 0;
            item.recolhida = zonasAtendimentoRecolhidas.has(item.zoneKey);
        });
        const renderizarNomesEquipe = (equipes, icone, alt, cor) => {
            if (!equipes?.length) return "";
            const nomesRenderizados = new Set();
            const codigosRenderizados = new Set();
            return equipes.map((equipe) => {
                const nomes = Array.isArray(equipe) ? equipe : equipe.nomes;
                const ocorrencias = Array.isArray(equipe) ? [] : equipe.ocorrencias || [];
                const disponivelSmartwall = Array.isArray(equipe) ? true : equipe.disponivelSmartwall !== false;
                const motivoIndisponibilidadeSmartwall = Array.isArray(equipe) ? "" : equipe.motivoIndisponibilidadeSmartwall || "";
                const codigoEquipe = Array.isArray(equipe) ? "" : equipe.codigo || "";
                const statusEquipe = Array.isArray(equipe) ? "" : equipe.atendimentoStatus || "";
                const nomesUnicos = [...new Set((nomes || []).filter(Boolean))];
                const classeStatus = statusEquipe === "andamento"
                    ? "region-agent-group-andamento"
                    : statusEquipe === "historico"
                        ? "region-agent-group-history"
                        : "region-agent-group-despacho";
                const chaveCodigo = normalizarCodigoEquipe(codigoEquipe);
                const codigoDuplicado = chaveCodigo && codigosRenderizados.has(chaveCodigo);
                if (chaveCodigo && !codigoDuplicado) codigosRenderizados.add(chaveCodigo);
                const nomesAgentes = nomesUnicos.filter((nome) => !chaveCodigo || normalizarCodigoEquipe(nome) !== chaveCodigo);
                const aguardandoNomeAgente = "AGUARDANDO O NOME DO AGENTE";
                const nomesExibidos = nomesAgentes.length ? nomesAgentes : [aguardandoNomeAgente];
                if (!nomesExibidos.length) return "";
                return `
                <span class="region-agent-group ${classeStatus} ${ocorrencias.length ? "region-agent-group-active" : ""}" style="--agent-color: ${cor}">
                    <img class="region-agent-icon region-agent-icon-${alt === "Moto" ? "mt" : "vt"}" src="${icone}" alt="${alt}">
                    <span>
                        ${codigoEquipe ? `<span class="region-agent-code">${escapeHtml(codigoEquipe)}</span>` : ""}
                        ${nomesExibidos.map((nome) => {
                            const chaveNome = normalizarTexto(nome);
                            const nomeAguardando = nome === aguardandoNomeAgente;
                            const nomeDuplicado = nomeAguardando || (!nomesAgentes.length && codigoDuplicado) || (chaveNome && nomesRenderizados.has(chaveNome));
                            if (chaveNome && !nomeDuplicado) nomesRenderizados.add(chaveNome);
                            const nomeExibido = nomeDuplicado ? aguardandoNomeAgente : nome;
                            const nomeCurto = nomeDuplicado ? nomeExibido : formatarNomeEquipe(nome);
                            if (nomeDuplicado) {
                                return `<span class="region-agent-name region-agent-name-duplicated" title="${escapeHtml(nomeExibido)}">${escapeHtml(nomeCurto)}</span>`;
                            }
                            return disponivelSmartwall
                                ? `<span class="region-agent-name region-agent-name-available" title="${escapeHtml(nome)}">${escapeHtml(nomeCurto)}</span>`
                                : `<button type="button" class="region-agent-name region-agent-name-unavailable region-agent-name-reason" data-agent-name="${escapeHtml(nome)}" data-reason="${escapeHtml(motivoIndisponibilidadeSmartwall)}" data-codigo="${escapeHtml(codigoEquipe)}" title="${escapeHtml(nome)}">${escapeHtml(nomeCurto)}</button>`;
                        }).join("")}
                    </span>
                </span>
            `;
            }).join("");
        };
        legend.innerHTML = `
            <div class="region-ranking-title">
                <span>motos e viaturas disponiveis em campo</span>
                <img src="src/live_png.png" alt="Ao vivo">
            </div>
            <div class="region-ranking-head">
                <span>ZONA</span>
                <span>OCORR&Ecirc;NCIAS</span>
                <span class="region-ranking-head-team"><img src="src/vt_png.png" alt="" aria-hidden="true">VT / EQUIPE</span>
                <span class="region-ranking-head-team"><img src="src/mt_png.png" alt="" aria-hidden="true">MT / EQUIPE</span>
            </div>
            <div class="region-ranking-list">
                ${linhas.map((item) => `
                    <div class="region-ranking-row ${item.temEquipe ? "" : "region-ranking-row-empty"} ${item.recolhida ? "region-ranking-row-collapsed" : ""}" style="--legend-color: ${item.cor}">
                        <div class="region-info">
                            <button type="button" class="region-name-line region-zone-toggle" data-zone-key="${escapeHtml(item.zoneKey)}" aria-expanded="${item.recolhida ? "false" : "true"}" aria-label="${item.recolhida ? "Abrir" : "Recolher"} equipes da ${escapeHtml(item.zona)}">
                                <span>ZONA</span>
                                <strong class="region-name ${/^ZONA\s+GERAL$/i.test(item.zona) ? "region-name-general" : ""}">${escapeHtml(item.zona.replace(/^ZONA\s+/i, ""))}</strong>
                                <i class="region-zone-arrow" aria-hidden="true"></i>
                            </button>
                            <div class="region-occurrence-cell ${item.temEquipeAtendendo ? "region-occurrence-active region-occurrence-andamento" : ""}">
                                <strong>${item.ocorrencias}</strong>
                                <span>${item.ocorrencias === 1 ? "ativa" : "ativas"}</span>
                            </div>
                            <div class="region-fleet-panel region-fleet-vt">
                                <span class="region-agents">${renderizarNomesEquipe(item.agentesVt, "src/vt_png.png", "Viatura", item.cor)}</span>
                            </div>
                            <div class="region-fleet-panel region-fleet-mt">
                                <span class="region-agents">${renderizarNomesEquipe(item.agentesMt, "src/mt_png.png", "Moto", item.cor)}</span>
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
            <div class="region-ranking-total">
                <span class="region-total-fleet region-total-vt"><img src="src/vt_png.png" alt="Viatura"> ${totalVt}</span>
                <span class="region-total-label">Total geral</span>
                <span class="region-total-fleet region-total-mt"><img src="src/mt_png.png" alt="Moto"> ${totalMt}</span>
            </div>
        `;
    }

    function atualizarTotalCentro(canvas) {
        const container = canvas.closest(".canvas-container");
        if (!container) return;

        let centro = container.querySelector(".chart-total-center");
        if (!centro) {
            centro = document.createElement("div");
            centro.className = "chart-total-center";
            container.appendChild(centro);
        }
        centro.innerHTML = "";
    }

    function atualizarGraficoRegioes(dadosRegiaoAtivas, dadosRegiaoHoje, frotaAtivaPorRegiao, frotaOcorrenciasHoje, frotaOcorrenciasHojePorRegiao, ocorrenciasPeriodo, mapaNomesAgentes, agentesAtivosPorRegiao) {
        const canvas = document.getElementById("chartRegioes");
        if (!canvas) return;

        const labelsResumo = regioesPainel;
        const ocorrenciasPorRegiaoPeriodo = labelsResumo.reduce((acc, regiao) => {
            acc[regiao] = [];
            return acc;
        }, {});
        (ocorrenciasPeriodo || []).forEach((ocorrencia) => {
            const zona = getZona(ocorrencia);
            if (ocorrenciasPorRegiaoPeriodo[zona]) ocorrenciasPorRegiaoPeriodo[zona].push(ocorrencia);
        });
        const totaisPorRegiao = labelsResumo.map((regiao) => dadosRegiaoHoje?.[regiao] || 0);
        const temDadosRegiao = totaisPorRegiao.some((valor) => valor > 0);
        const datasetData = temDadosRegiao ? totaisPorRegiao : [1];
        const datasetColors = temDadosRegiao ? coresPainelRegiao : ["rgba(255, 255, 255, 0.16)"];
        const totalGeral = totaisPorRegiao.reduce((acc, valor) => acc + valor, 0);
        const totalMt = frotaOcorrenciasHoje?.mt || 0;
        const totalVt = frotaOcorrenciasHoje?.vt || 0;
        const ctxRegioes = canvas.getContext("2d");
        const dimensaoGrafico = Math.min(
            canvas.clientWidth || canvas.parentElement?.clientWidth || 420,
            canvas.clientHeight || canvas.parentElement?.clientHeight || 420
        );
        const paddingGrafico = Math.round(Math.max(32, Math.min(82, dimensaoGrafico * 0.18)));
        if (myChartRegioes) myChartRegioes.destroy();
        renderizarRankingGraficoRegiao(labelsResumo, frotaAtivaPorRegiao, agentesAtivosPorRegiao, dadosRegiaoAtivas);

        const formatarRotuloZona = (regiao, index) => {
            if (normalizarZona(regiao) === "GERAL") return "GERAL";
            const numero = String(regiao || "").match(/\d+/)?.[0] || String(index + 1);
            return `ZONA ${numero}`;
        };
        const formatarPercentualZona = (valor) => {
            return totalGeral ? ((valor / totalGeral) * 100).toFixed(1) : "0.0";
        };

        const labelsDonutRegiaoPlugin = {
            id: "labelsDonutRegiaoSmartwall",
            afterDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                if (!meta?.data?.length) return;
                const { ctx } = chart;
                const temaDia = document.body.dataset.theme === "day";
                const centerX = meta.data[0].x;
                const centerY = meta.data[0].y;
                const largura = chart.width;
                const altura = chart.height;
                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;

                const arcBase = meta.data.find((arc) => arc.outerRadius) || meta.data[0];
                const innerRadius = arcBase.innerRadius || 52;
                const centroRadius = Math.max(innerRadius - Math.max(4, innerRadius * 0.06), 30);
                const fonteAjustada = (texto, peso, tamanhoBase, larguraMaxima, minimo = 6) => {
                    let tamanho = tamanhoBase;
                    do {
                        ctx.font = `${peso} ${tamanho}px Segoe UI, sans-serif`;
                        if (ctx.measureText(String(texto)).width <= larguraMaxima || tamanho <= minimo) break;
                        tamanho -= 1;
                    } while (tamanho > minimo);
                    return tamanho;
                };
                const obterFontesRotuloZona = (outerRadius) => ({
                    zona: Math.max(16, Math.min(22, outerRadius * 0.075)),
                    percentual: Math.max(17, Math.min(24, outerRadius * 0.082))
                });

                ctx.beginPath();
                ctx.arc(centerX, centerY, centroRadius, 0, Math.PI * 2);
                ctx.fillStyle = temaDia ? "#d7dee6" : "#071126";
                ctx.fill();
                ctx.lineWidth = Math.max(1, centroRadius * 0.025);
                ctx.strokeStyle = temaDia ? "rgba(16, 24, 32, 0.46)" : "rgba(255, 255, 255, 0.86)";
                ctx.stroke();

                ctx.fillStyle = temaDia ? "#101820" : "#ffffff";
                fonteAjustada("TOTAL GERAL", 900, Math.max(7, centroRadius * 0.14), centroRadius * 1.34, 6);
                ctx.fillText("TOTAL GERAL", centerX, centerY - centroRadius * 0.58);
                fonteAjustada(String(totalGeral), 950, Math.max(15, centroRadius * 0.34), centroRadius * 1.08, 9);
                ctx.fillText(String(totalGeral), centerX, centerY - centroRadius * 0.28);

                const iconSize = Math.max(11, Math.min(28, centroRadius * 0.28));
                const colunaOffset = centroRadius * 0.32;
                const iconY = centerY + centroRadius * 0.03;
                ctx.filter = temaDia ? "brightness(0)" : "brightness(0) invert(1)";
                if (vtIconImg.complete) ctx.drawImage(vtIconImg, centerX - colunaOffset - (iconSize / 2), iconY - (iconSize / 2), iconSize, iconSize);
                if (mtIconImg.complete) ctx.drawImage(mtIconImg, centerX + colunaOffset - (iconSize / 2), iconY - (iconSize / 2), iconSize, iconSize);
                ctx.filter = "none";
                fonteAjustada(String(Math.max(totalVt, totalMt)), 950, Math.max(12, centroRadius * 0.26), centroRadius * 0.52, 8);
                ctx.fillText(String(totalVt), centerX - colunaOffset, centerY + centroRadius * 0.55);
                ctx.fillText(String(totalMt), centerX + colunaOffset, centerY + centroRadius * 0.55);

                if (!temDadosRegiao) {
                    ctx.restore();
                    return;
                }

                const labelsExternos = meta.data.map((arc, index) => {
                    const valor = chart.data.datasets[0].data[index] || 0;
                    if (!valor) return null;
                    const regiao = chart.data.labels[index];
                    const cor = chart.data.datasets[0].backgroundColor[index] || "#ffffff";
                    const startAngle = Number.isFinite(arc.startAngle) ? arc.startAngle : -Math.PI / 2;
                    const endAngle = Number.isFinite(arc.endAngle) ? arc.endAngle : startAngle;
                    const angle = (startAngle + endAngle) / 2;
                    const outerRadius = arc.outerRadius || Math.min(largura, altura) * 0.32;
                    const innerRadiusArc = arc.innerRadius || innerRadius;
                    const textoRadius = innerRadiusArc + ((outerRadius - innerRadiusArc) * 0.54);
                    const textoX = centerX + Math.cos(angle) * textoRadius;
                    const textoY = centerY + Math.sin(angle) * textoRadius;
                    const startX = centerX + Math.cos(angle) * (outerRadius - 2);
                    const startY = centerY + Math.sin(angle) * (outerRadius - 2);
                    const ladoDireito = Math.cos(angle) >= 0;
                    const distanciaExterna = Math.max(28, Math.min(46, outerRadius * 0.16));
                    const rotuloZona = formatarRotuloZona(regiao, index);
                    const percentualZona = `${formatarPercentualZona(valor)}%`;
                    const { zona: fontZona, percentual: fontPercentual } = obterFontesRotuloZona(outerRadius);
                    ctx.font = `800 ${fontZona}px Segoe UI, sans-serif`;
                    const larguraRotulo = ctx.measureText(rotuloZona).width;
                    ctx.font = `800 ${fontPercentual}px Segoe UI, sans-serif`;
                    const larguraPercentual = ctx.measureText(percentualZona).width;
                    const larguraLabel = Math.max(larguraRotulo, larguraPercentual);
                    const margemLateral = Math.max(36, larguraLabel + 8);
                    const espacoLateral = ladoDireito
                        ? largura - (centerX + outerRadius) - margemLateral
                        : centerX - outerRadius - margemLateral;
                    const usarAreaSuperior = espacoLateral < larguraLabel + 18;
                    const turnX = centerX + Math.cos(angle) * (outerRadius + distanciaExterna * 0.28);
                    const turnY = centerY + Math.sin(angle) * (outerRadius + distanciaExterna * 0.28);
                    const labelRadius = outerRadius + distanciaExterna;
                    const labelXBase = centerX + Math.cos(angle) * labelRadius + (ladoDireito ? distanciaExterna * 0.18 : -distanciaExterna * 0.18);
                    const labelYBase = centerY + Math.sin(angle) * labelRadius;
                    const topoDisponivel = Math.max(18, centerY - outerRadius - 16);
                    const passoSuperior = Math.max(15, Math.min(22, topoDisponivel / Math.max(1, meta.data.length)));
                    const numeroZona = Number(String(rotuloZona).match(/\d+/)?.[0] || 0);
                    const posicaoAbaixoDonut = centerY + outerRadius + Math.max(18, outerRadius * 0.14);
                    const deslocamentoBaixo = numeroZona === 4 ? outerRadius * 0.18 : numeroZona === 5 ? outerRadius * 0.32 : 0;
                    const labelXSuperior = centerX + (ladoDireito ? 1 : -1) * Math.min(Math.max(outerRadius * 0.34, larguraLabel * 0.72), Math.max(28, centerX - margemLateral));
                    const limiteEsquerdo = ladoDireito ? 8 : larguraLabel + 8;
                    const limiteDireito = ladoDireito ? largura - larguraLabel - 8 : largura - 8;
                    const labelX = Math.min(Math.max(usarAreaSuperior ? labelXSuperior : labelXBase, limiteEsquerdo), limiteDireito);
                    const labelY = usarAreaSuperior
                        ? (numeroZona >= 4
                            ? Math.min(Math.max(posicaoAbaixoDonut + ((numeroZona === 5) ? passoSuperior * 1.05 : 0), 18), altura - 22)
                            : Math.min(Math.max(topoDisponivel - (index % meta.data.length) * passoSuperior, 18), altura - 22))
                        : (numeroZona >= 4
                            ? Math.min(Math.max(posicaoAbaixoDonut + ((numeroZona === 5) ? passoSuperior * 1.05 : 0) + deslocamentoBaixo, 18), altura - 22)
                            : Math.min(Math.max(labelYBase, 18), altura - 22));

                    return {
                        valor,
                        cor,
                        startX,
                        startY,
                        ladoDireito,
                        rotuloZona,
                        percentualZona,
                        textoX,
                        textoY,
                        labelX,
                        labelY,
                        larguraLabel,
                        outerRadius,
                        innerRadiusArc
                    };
                }).filter(Boolean);

                const distribuirLabels = (items) => {
                    if (!items.length) return;
                    const alturaLabel = 29;
                    const espacoMinimo = 11;
                    const minGap = alturaLabel + espacoMinimo;
                    const margemVertical = Math.max(22, alturaLabel / 2 + 6);
                    const topo = margemVertical;
                    const base = altura - margemVertical;
                    items.sort((a, b) => a.labelY - b.labelY);
                    items.forEach((item, index) => {
                        const anterior = items[index - 1];
                        item.labelY = Math.min(Math.max(item.labelY, topo), base);
                        if (anterior && item.labelY - anterior.labelY < minGap) {
                            item.labelY = anterior.labelY + minGap;
                        }
                    });
                    const excesso = items[items.length - 1].labelY - base;
                    if (excesso > 0) {
                        items.forEach((item) => {
                            item.labelY -= excesso;
                        });
                    }
                    for (let index = items.length - 2; index >= 0; index -= 1) {
                        const proximo = items[index + 1];
                        if (proximo.labelY - items[index].labelY < minGap) {
                            items[index].labelY = proximo.labelY - minGap;
                        }
                    }
                    items.forEach((item) => {
                        item.labelY = Math.min(Math.max(item.labelY, topo), base);
                    });
                };

                distribuirLabels(labelsExternos.filter((item) => item.ladoDireito));
                distribuirLabels(labelsExternos.filter((item) => !item.ladoDireito));

                labelsExternos.forEach((item) => {
                    const {
                        valor,
                        cor,
                        startX,
                        startY,
                        ladoDireito,
                        rotuloZona,
                        percentualZona,
                        textoX,
                        textoY,
                        labelX,
                        labelY,
                        larguraLabel,
                        outerRadius,
                        innerRadiusArc
                    } = item;
                    const { zona: fontZona, percentual: fontPercentual } = obterFontesRotuloZona(outerRadius);

                    ctx.strokeStyle = cor;
                    ctx.lineWidth = 1.35;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(labelX + (ladoDireito ? -7 : 7), labelY);
                    ctx.stroke();

                    ctx.textAlign = ladoDireito ? "left" : "right";
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = temaDia ? "rgba(255, 255, 255, 0.92)" : "rgba(2, 11, 22, 0.94)";
                    ctx.fillStyle = cor;
                    ctx.font = `800 ${fontZona}px Segoe UI, sans-serif`;
                    ctx.strokeText(rotuloZona, labelX, labelY - 9);
                    ctx.fillText(rotuloZona, labelX, labelY - 9);
                    ctx.font = `800 ${fontPercentual}px Segoe UI, sans-serif`;
                    ctx.strokeText(percentualZona, labelX, labelY + 10);
                    ctx.fillText(percentualZona, labelX, labelY + 10);
                    ctx.textAlign = "center";
                    ctx.fillStyle = temaDia ? "#101820" : "#ffffff";
                    ctx.shadowColor = temaDia ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.48)";
                    ctx.shadowBlur = temaDia ? 2 : 4;
                    const espessuraArco = Math.max(18, outerRadius - innerRadiusArc);
                    const tamanhoNumeroArco = Math.max(14, Math.min(34, outerRadius * 0.105, espessuraArco * 0.72));
                    const larguraNumeroArco = Math.max(22, espessuraArco * 0.96);
                    fonteAjustada(String(valor), 950, tamanhoNumeroArco, larguraNumeroArco, 10);
                    ctx.fillText(String(valor), textoX, textoY);
                    ctx.shadowColor = "transparent";
                    ctx.shadowBlur = 0;
                });
                ctx.restore();
            }
        };

        myChartRegioes = new Chart(ctxRegioes, {
            type: "doughnut",
            data: {
                labels: labelsResumo,
                datasets: [{
                    data: datasetData,
                    backgroundColor: datasetColors,
                    borderColor: document.body.dataset.theme === "day" ? "rgba(16, 24, 32, 0.42)" : "rgba(255, 255, 255, 0.82)",
                    borderWidth: 2,
                    hoverOffset: 4,
                    spacing: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                cutout: "56%",
                rotation: -90,
                layout: {
                    padding: { left: paddingGrafico, right: paddingGrafico, top: paddingGrafico, bottom: Math.max(12, paddingGrafico * 0.72) }
                },
                onClick: (event, elements, chart) => {
                    if (!temDadosRegiao || !elements.length) return;
                    const index = elements[0].index;
                    const regiao = chart.data.labels[index];
                    const ocorrencias = ocorrenciasPorRegiaoPeriodo?.[regiao] || [];
                    const frota = frotaOcorrenciasHojePorRegiao?.[regiao] || { mt: 0, vt: 0 };
                    abrirModalRegiaoGrafico(formatarRotuloZona(regiao, index), ocorrencias, frota, mapaNomesAgentes);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = temDadosRegiao && elements.length ? "pointer" : "default";
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const valor = context.raw || 0;
                                const regiao = context.label;
                                const frota = frotaOcorrenciasHojePorRegiao?.[regiao] || { mt: 0, vt: 0 };
                                const percentual = totalGeral ? ((valor / totalGeral) * 100).toFixed(1).replace(".", ",") : "0,0";
                                return `${regiao}: ${valor} ocorrencia${valor === 1 ? "" : "s"} (${percentual}%) | VT ${frota.vt || 0} | MT ${frota.mt || 0}`;
                            }
                        }
                    }
                }
            },
            plugins: [labelsDonutRegiaoPlugin]
        });
    }

    function atualizarGraficoTipos(dadosTipo) {
        const canvas = document.getElementById("chartTipos");
        const tiposOrdenados = Object.entries(dadosTipo)
            .filter(([, qtd]) => qtd > 0)
            .sort((a, b) => b[1] - a[1]);
        const total = tiposOrdenados.reduce((acc, [, qtd]) => acc + qtd, 0);
        renderizarResumoTipo(tiposOrdenados, total);
        if (!canvas) return;

        const ctxTipos = canvas.getContext("2d");
        if (myChartTipos) myChartTipos.destroy();

        if (!tiposOrdenados.length) {
            myChartTipos = null;
            ctxTipos.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const maiorTipo = tiposOrdenados.reduce((max, [, qtd]) => Math.max(max, qtd), 0);
        ctxTipos.font = "800 11px Segoe UI, sans-serif";
        const maiorNomeTipo = tiposOrdenados.reduce((max, [tipo]) => Math.max(max, ctxTipos.measureText(String(tipo).toUpperCase()).width), 0);
        const larguraCanvasTipo = Math.max(320, canvas.clientWidth || canvas.width || 320);
        const reservaRotuloTipo = Math.min(0.62, Math.max(0.28, (maiorNomeTipo + 72) / larguraCanvasTipo));
        const escalaMaximaTipo = Math.max(1, Math.ceil(maiorTipo / (1 - reservaRotuloTipo)));
        const labelBarrasPlugin = {
            id: "labelBarrasSmartwall",
            afterDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                const yScale = scales.y;
                const dataset = chart.data.datasets[0];
                const canvasRight = chart.width - 8;
                const outsideGap = 10;
                const insideGap = 14;
                const temaDia = document.body.dataset.theme === "day";
                const corDentro = temaDia ? "#000000" : "#ffffff";
                const corFora = temaDia ? "#06131f" : "#e8f4ff";
                const isLargeScreen = window.matchMedia("(min-width: 1518px)").matches;
                const tamanhoLabelBase = isLargeScreen ? 18 : 11;
                const tamanhoValorBase = isLargeScreen ? 24 : 16;

                const ajustarFonte = (texto, peso, tamanhoBase, larguraMaxima) => {
                    let tamanho = tamanhoBase;
                    do {
                        ctx.font = `${peso} ${tamanho}px Segoe UI, sans-serif`;
                        if (ctx.measureText(texto).width <= larguraMaxima || tamanho <= 6) break;
                        tamanho -= 1;
                    } while (tamanho > 6);
                };

                ctx.save();
                ctx.textBaseline = "middle";
                chart.data.labels.forEach((label, index) => {
                    const valor = dataset.data[index] || 0;
                    const textoLabel = String(label).toUpperCase();
                    const textoValor = String(valor);
                    const y = yScale.getPixelForValue(index);
                    const xBarraInicio = xScale.getPixelForValue(0);
                    const xBarraFim = xScale.getPixelForValue(valor);
                    const larguraBarra = Math.max(0, xBarraFim - xBarraInicio);
                    ctx.font = `800 ${tamanhoLabelBase}px Segoe UI, sans-serif`;
                    const larguraLabel = ctx.measureText(textoLabel).width;
                    ctx.font = `900 ${tamanhoValorBase}px Segoe UI, sans-serif`;
                    const larguraValor = ctx.measureText(textoValor).width;
                    const cabeDentro = larguraBarra >= Math.max(larguraLabel, larguraValor) + (insideGap * 2);

                    if (cabeDentro) {
                        const xCentro = Math.max(chartArea.left + insideGap, Math.min(xBarraFim - insideGap, (xBarraInicio + xBarraFim) / 2));
                        ctx.textAlign = "center";
                        ctx.font = `800 ${tamanhoLabelBase}px Segoe UI, sans-serif`;
                        ctx.fillStyle = corDentro;
                        ctx.fillText(textoLabel, xCentro, y - 8);

                        ctx.font = `900 ${tamanhoValorBase}px Segoe UI, sans-serif`;
                        ctx.fillStyle = corDentro;
                        ctx.fillText(textoValor, xCentro, y + 12);
                        return;
                    }

                    const xFora = Math.min(xBarraFim + outsideGap, canvasRight - 12);
                    const larguraFora = Math.max(52, canvasRight - xFora);
                    ctx.textAlign = "left";
                    ajustarFonte(textoLabel, 800, tamanhoLabelBase, larguraFora);
                    ctx.fillStyle = corFora;
                    ctx.fillText(textoLabel, xFora, y - 8);

                    ajustarFonte(textoValor, 900, tamanhoValorBase, larguraFora);
                    ctx.fillStyle = corFora;
                    ctx.fillText(textoValor, xFora, y + 12);
                });
                ctx.restore();
            }
        };

        myChartTipos = new Chart(ctxTipos, {
            type: "bar",
            data: {
                labels: tiposOrdenados.map((tipo) => tipo[0]),
                datasets: [{
                    label: "Ocorrências",
                    data: tiposOrdenados.map((tipo) => tipo[1]),
                    backgroundColor: tiposOrdenados.map((_, index) => coresTipo[index] || coresTipo[0]),
                    borderColor: tiposOrdenados.map((_, index) => coresTipo[index] || coresTipo[0]),
                    borderWidth: 1,
                    borderRadius: 6,
                    barThickness: Math.max(24, Math.min(42, 240 / Math.max(1, tiposOrdenados.length)))
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                layout: {
                    padding: { left: 0, right: 34, top: 12, bottom: 4 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.raw} ocorrências`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: "rgba(103, 153, 210, 0.28)", borderDash: [5, 6] },
                        suggestedMax: escalaMaximaTipo,
                        ticks: { display: false },
                        title: { display: false }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { display: false }
                    }
                }
            },
            plugins: [labelBarrasPlugin]
        });
    }

    function renderizarResumoTipo(tiposOrdenados, total) {
        const legend = document.getElementById("typeLegend");
        const totalEl = document.getElementById("typeTotalHoje");
        if (totalEl) totalEl.textContent = String(total);
        if (!legend) return;

        legend.innerHTML = "";

        tiposOrdenados.forEach(([tipo, qtd], index) => {
            const cor = coresTipo[index] || coresTipo[0];
            const percentual = total > 0 ? Math.round((qtd / total) * 100) : 0;
            const icone = getIconeTipoOcorrencia(tipo);
            const tipoNormalizado = normalizarTexto(tipo).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const classeIcone = tipoNormalizado === "SINISTRO COM VITIMA E/OU CRIME" ? " type-legend-icon-crime" : "";
            legend.insertAdjacentHTML("beforeend", `
                <div class="type-legend-item" style="--type-color: ${cor}">
                    <span class="type-legend-icon" aria-hidden="true">
                        <img class="${classeIcone.trim()}" src="${icone}" alt="">
                    </span>
                    <span class="type-legend-name">${escapeHtml(tipo)}</span>
                    <span class="type-legend-metrics">
                        <strong class="type-legend-count">${qtd}</strong>
                        <span class="type-legend-percent">${percentual}%</span>
                    </span>
                </div>
            `);
        });
    }

    renderizarFiltroTurnos();

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        atualizarNomeOperador(user);

        let docsHoje = [];
        let docsPendentes = [];
        let docsAtivosAgentes = [];
        let docsHistoricoAgentes = [];
        const qHoje = query(collection(db, "ocorrencias_sttu"), where("data_filtro", "==", dataFiltro));
        const qPendentes = query(collection(db, "ocorrencias_sttu"), where("situacao", "in", STATUS_PAINEL_PENDENTES));
        const qHistoricoAgentes = query(collection(db, "historico_agentes"), where("dataRelatorio", "==", dataRelatorioFiltro));

        onSnapshot(qHoje, (snapshot) => {
            docsHoje = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });

        onSnapshot(qPendentes, (snapshot) => {
            docsPendentes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });

        onSnapshot(collection(db, "ativos_agentes"), (snapshot) => {
            docsAtivosAgentes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });

        onSnapshot(qHistoricoAgentes, (snapshot) => {
            docsHistoricoAgentes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });
    });

    async function atualizarNomeOperador(user) {
        const smartUserName = document.getElementById("smartUserName");
        if (!smartUserName) return;

        let nome = user.displayName || "Visualizador";

        try {
            const snap = await getDoc(doc(db, "usuarios", user.uid));
            if (snap.exists()) {
                const dados = snap.data();
                nome = dados.nome || dados.nomeCompleto || nome;
            }
        } catch (error) {
            console.warn("Nao foi possivel buscar o nome do operador:", error);
        }

        smartUserName.textContent = `Ol\u00e1, ${nome}`;
    }
}

iniciarSmartwall().catch((error) => {
    console.error("Erro ao carregar smartwall:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexao e atualize a pagina.");
});
