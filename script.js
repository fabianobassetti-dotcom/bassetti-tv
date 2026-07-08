// Estado Global da Aplicação
let totalCanais = [];
let favoritos = JSON.parse(localStorage.getItem('bassetti_tv_favoritos')) || [];
let historico = JSON.parse(localStorage.getItem('bassetti_tv_historico')) || [];
let filtroAtual = 'TODOS'; // TODOS, FAVORITOS, HISTORICO
let categoriaSelecionada = 'TODOS';
let hlsInstance = null;

// INSTÂNCIA GLOBAL DE ÁUDIO (Para tocar a rádio em segundo plano)
let radioAudioInstance = null;
let monitoramentoRadioInterval = null;

// Nova constante apontando para o arquivo de configuração dupla
const ARQUIVO_CONFIG_VISUAL = "config-radio-visual.txt"; 

// Armazena o estado do que está passando na tela para evitar recarregamentos repetidos no loop
let estadoVisualAtual = null; // "OFFLINE" ou "ONLINE"

// Elementos do DOM
const DOM = {
    search: document.getElementById('search-input'),
    channelsList: document.getElementById('channels-list'),
    categorySelect: document.getElementById('category-select'),
    video: document.getElementById('video-player'),
    placeholder: document.getElementById('player-placeholder'),
    currentLogo: document.getElementById('current-logo'),
    currentTitle: document.getElementById('current-title'),
    currentGroup: document.getElementById('current-group'),
    btnFav: document.getElementById('btn-toggle-favorite'),
    statusBar: document.getElementById('status-text'),
    tabTodos: document.getElementById('btn-todos'),
    tabFavs: document.getElementById('btn-favoritos'),
    tabHist: document.getElementById('btn-historico')
};

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', () => {
    inicializarListeners();
    carregarPlaylist();
});

function inicializarListeners() {
    DOM.search.addEventListener('input', renderizarCanais);
    DOM.categorySelect.addEventListener('change', (e) => {
        categoriaSelecionada = e.target.value;
        renderizarCanais();
    });

    DOM.tabTodos.addEventListener('click', () => alternarFiltro('TODOS', DOM.tabTodos));
    DOM.tabFavs.addEventListener('click', () => alternarFiltro('FAVORITOS', DOM.tabFavs));
    DOM.tabHist.addEventListener('click', () => alternarFiltro('HISTORICO', DOM.tabHist));

    DOM.btnFav.addEventListener('click', gerenciarFavoritos);
}

function alternarFiltro(tipo, elementoBotao) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    elementoBotao.classList.add('active');
    filtroAtual = tipo;
    renderizarCanais();
}

async function carregarPlaylist() {
    atualizarStatus("Buscando playlist do repositório backend...");
    try {
        const resposta = await fetch(CONFIG.PLAYLIST_URL);
        if (!resposta.ok) throw new Error("Falha ao ler dados do servidor.");
        const textoM3u = await resposta.text();
        
        parseM3U(textoM3u);
        popularCategorias();
        renderizarCanais();
        atualizarStatus(`Canais carregados com sucesso: ${totalCanais.length} disponíveis.`);
    } catch (erro) {
        console.error(CONFIG.LOG_PREFIX, erro);
        DOM.channelsList.innerHTML = `<div class="loading-message" style="color: #ff4a4a;">Erro ao carregar canais.</div>`;
        atualizarStatus("Erro crítico na importação da playlist.");
    }
}

function parseM3U(dadosBrutos) {
    const linhas = dadosBrutos.split('\n');
    let canalAtual = null;

    for (let i = 0; i < linhas.length; i++) {
        let line = linhas[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            canalAtual = {};
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            const groupMatch = line.match(/group-title="([^"]*)"/);
            const virgulaIndex = line.lastIndexOf(',');
            const nomeCanal = virgulaIndex !== -1 ? line.substring(virgulaIndex + 1).stripOrNormal() : "Canal Sem Nome";

            canalAtual.nome = nomeCanal;
            canalAtual.logo = logoMatch ? logoMatch[1] : '';
            canalAtual.grupo = groupMatch ? groupMatch[1].toUpperCase() : 'OUTROS';
        } else if (line && !line.startsWith('#') && canalAtual) {
            canalAtual.url = line;
            totalCanais.push(canalAtual);
            canalAtual = null;
        }
    }
}

String.prototype.stripOrNormal = function() {
    return this.trim();
};

// Parser inteligente que lê o arquivo TXT e extrai as duas variáveis separadamente
async function obterConfiguracoesVisuaisExternas() {
    let configs = { tvOffline: "", radioOnline: "" };
    try {
        const resposta = await fetch(ARQUIVO_CONFIG_VISUAL);
        if (!resposta.ok) throw new Error("Arquivo de configuração visual não encontrado");
        const texto = await resposta.text();
        const linhas = texto.split('\n');

        linhas.forEach(linha => {
            if (linha.includes('LINK_TV_OFFLINE=')) {
                configs.tvOffline = linha.replace('LINK_TV_OFFLINE=', '').trim();
            }
            if (linha.includes('LINK_RADIO_ONLINE=')) {
                configs.radioOnline = linha.replace('LINK_RADIO_ONLINE=', '').trim();
            }
        });
    } catch (erro) {
        console.warn("Falha ao ler TXT de configuração visual. Usando fallbacks.", erro);
        configs.tvOffline = "https://cameras.santoandre.sp.gov.br/coi04/ID_597";
        configs.radioOnline = "https://wz4.camera.com.br/santoandre/live.stream/playlist.m3u8";
    }
    return configs;
}

function verificarSinalStream(url) {
    return new Promise(resolve => {
        const testeAudio = new Audio();
        const finalizar = (resultado) => {
            resolve(resultado);
            testeAudio.src = "";
        };
        testeAudio.onplaying = () => finalizar(true);
        testeAudio.oncanplaythrough = () => finalizar(true);
        testeAudio.onerror = () => finalizar(false);
        testeAudio.onstalled = () => finalizar(false);

        testeAudio.src = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
        testeAudio.load();
        setTimeout(() => finalizar(false), 4000);
    });
}

function popularCategorias() {
    const gruposUnicos = new Set(totalCanais.map(c => c.grupo));
    const gruposOrdenados = Array.from(gruposUnicos).sort();
    if(gruposOrdenados.includes("BRAZIL")) {
        gruposOrdenados.splice(gruposOrdenados.indexOf("BRAZIL"), 1);
        gruposOrdenados.unshift("BRAZIL");
    }
    gruposOrdenados.forEach(grupo => {
        const option = document.createElement('option');
        option.value = grupo;
        option.textContent = grupo;
        DOM.categorySelect.appendChild(option);
    });
}

function renderizarCanais() {
    DOM.channelsList.innerHTML = '';
    const busca = DOM.search.value.toLowerCase().trim();
    let canaisFiltrados = [...totalCanais];

    if (filtroAtual === 'FAVORITOS') {
        canaisFiltrados = canaisFiltrados.filter(c => favoritos.includes(c.url));
    } else if (filtroAtual === 'HISTORICO') {
        canaisFiltrados = historico.map(url => totalCanais.find(c => c.url === url)).filter(Boolean);
    }
    if (categoriaSelecionada !== 'TODOS' && filtroAtual === 'TODOS') {
        canaisFiltrados = canaisFiltrados.filter(c => c.grupo === categoriaSelecionada);
    }
    if (busca) {
        canaisFiltrados = canaisFiltrados.filter(c => c.nome.toLowerCase().includes(busca));
    }
    if (canaisFiltrados.length === 0) {
        DOM.channelsList.innerHTML = '<div class="loading-message">Nenhum canal localizado.</div>';
        return;
    }

    const imgPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'><rect x='2' y='2' width='20' height='20' rx='2.18' ry='2.18'></rect><line x1='7' y1='2' x2='7' y2='22'></line><line x1='17' y1='2' x2='17' y2='22'></line><line x1='2' y1='12' x2='22' y2='12'></line></svg>";

    canaisFiltrados.forEach(canal => {
        const item = document.createElement('div');
        item.className = 'channel-item';
        if (DOM.video.dataset.currentUrl === canal.url) item.classList.add('active');

        const imgElement = document.createElement('img');
        imgElement.className = 'channel-logo';
        let limpaLogo = (canal.logo || '').replace(/['"]/g, '').trim();
        imgElement.src = limpaLogo || imgPlaceholder;
        imgElement.onerror = function() { this.src = imgPlaceholder; this.onerror = null; };

        const infoContainer = document.createElement('div');
        infoContainer.className = 'channel-info';
        infoContainer.innerHTML = `<div class="channel-name"></div><div class="channel-group"></div>`;
        infoContainer.querySelector('.channel-name').textContent = canal.nome;
        infoContainer.querySelector('.channel-group').textContent = canal.grupo;

        item.appendChild(imgElement);
        item.appendChild(infoContainer);
        item.addEventListener('click', () => carregarCanalNoPlayer(canal));
        DOM.channelsList.appendChild(item);
    });
}

// Injeta de forma dinâmica o sinal visual (iFrame ou Player de Vídeo HLS)
function aplicarFluxoVisualNoPlayer(urlVisual, forcarMudo = false) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    const iframeAntigo = document.getElementById('iframe-estetico-radio');
    if (iframeAntigo) { iframeAntigo.remove(); }

    DOM.video.style.display = "block";
    DOM.video.removeAttribute('src');
    DOM.video.type = "";
    DOM.video.muted = forcarMudo;

    if (urlVisual.includes(".m3u8") || urlVisual.includes(".mp4")) {
        if (Hls.isSupported()) {
            hlsInstance = new Hls({ maxBufferLength: 10, enableWorker: true });
            hlsInstance.loadSource(urlVisual);
            hlsInstance.attachMedia(DOM.video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { DOM.video.play(); });
        } else if (DOM.video.canPlayType('application/vnd.apple.mpegurl')) {
            DOM.video.src = urlVisual;
            DOM.video.addEventListener('loadedmetadata', () => { DOM.video.play(); });
        }
    } else {
        DOM.video.style.display = "none"; 
        const iframeCamera = document.createElement('iframe');
        iframeCamera.id = "iframe-estetico-radio";
        iframeCamera.src = urlVisual;
        iframeCamera.style.width = "100%";
        iframeCamera.style.height = "100%";
        iframeCamera.style.border = "none";
        iframeCamera.style.borderRadius = "4px";
        iframeCamera.setAttribute("allow", "autoplay");
        DOM.video.parentElement.appendChild(iframeCamera);
    }
}

async function carregarCanalNoPlayer(canal) {
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    DOM.video.dataset.currentUrl = canal.url;
    renderizarCanais();

    DOM.placeholder.classList.add('hidden');
    DOM.currentTitle.textContent = canal.nome;
    DOM.currentGroup.textContent = canal.grupo;
    if (canal.logo) { DOM.currentLogo.src = canal.logo; DOM.currentLogo.classList.remove('hidden'); } 
    else { DOM.currentLogo.classList.add('hidden'); }

    DOM.btnFav.classList.remove('hidden');
    atualizarBotaoFavoritoUI(canal.url);
    gerenciarHistorico(canal.url);

    // Reseta estados anteriores
    estadoVisualAtual = null;
    if (monitoramentoRadioInterval) { clearInterval(monitoramentoRadioInterval); monitoramentoRadioInterval = null; }
    if (radioAudioInstance) { radioAudioInstance.pause(); radioAudioInstance.src = ""; radioAudioInstance = null; }
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    const iframeAntigo = document.getElementById('iframe-estetico-radio');
    if (iframeAntigo) { iframeAntigo.remove(); }
    
    DOM.video.style.display = "block";
    DOM.video.removeAttribute('src');
    DOM.video.muted = false;

    const urlNormalizada = canal.url.toLowerCase();
    const isRadio = canal.grupo === "RADIOS" || urlNormalizada.includes("zeno.fm") || urlNormalizada.includes("zenofm.com");

    if (isRadio) {
        let urlSegura = canal.url.replace("http://", "https://");
        if (urlSegura.endsWith("/playlist.m3u8")) urlSegura = urlSegura.replace("/playlist.m3u8", "");
        else if (urlSegura.endsWith(".m3u8") || urlSegura.endsWith(".m3u")) urlSegura = urlSegura.substring(0, urlSegura.lastIndexOf('.'));
        if (urlSegura.endsWith("/live")) urlSegura = urlSegura.replace("/live", "");

        // ENGRENAGEM DE CHAVEAMENTO DE PLATÔ DINÂMICO (PRO)
        const gerenciarChaveamentoVisualERadio = async () => {
            const radioOnline = await verificarSinalStream(urlSegura);
            const urlsConfig = await obterConfiguracoesVisuaisExternas();

            if (radioOnline) {
                // CENÁRIO 1: RÁDIO ONLINE -> Transmite áudio da rádio e chaveia a imagem pro canal "ONLINE" (mudo)
                if (estadoVisualAtual !== "ONLINE") {
                    estadoVisualAtual = "ONLINE";
                    aplicarFluxoVisualNoPlayer(urlsConfig.radioOnline, true);
                }
                if (!radioAudioInstance) {
                    radioAudioInstance = new Audio(urlSegura);
                    radioAudioInstance.play()
                        .then(() => atualizarStatus(`Modo Visual Radio Ativo: ${canal.nome}`))
                        .catch(e => console.error("Erro no play da rádio:", e));
                }
            } else {
                // CENÁRIO 2: RÁDIO OFFLINE -> Desliga áudio da rádio e chaveia de volta para o canal "OFFLINE" (com áudio original)
                if (radioAudioInstance) {
                    radioAudioInstance.pause();
                    radioAudioInstance.src = "";
                    radioAudioInstance = null;
                }
                if (estadoVisualAtual !== "OFFLINE") {
                    estadoVisualAtual = "OFFLINE";
                    aplicarFluxoVisualNoPlayer(urlsConfig.tvOffline, false); // false mantêm o áudio original do canal offline
                }
                atualizarStatus(`Rádio Offline. Retornou para a programação da TV.`);
            }
        };

        await gerenciarChaveamentoVisualERadio();
        monitoramentoRadioInterval = setInterval(gerenciarChaveamentoVisualERadio, 8000);
            
    } else {
        // FLUXO DE CANAL DE TV CONVENCIONAL
        if (Hls.isSupported()) {
            hlsInstance = new Hls({ maxBufferLength: 10, enableWorker: true });
            hlsInstance.loadSource(canal.url);
            hlsInstance.attachMedia(DOM.video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { DOM.video.play(); });
        } else if (DOM.video.canPlayType('application/vnd.apple.mpegurl')) {
            DOM.video.src = canal.url;
            DOM.video.addEventListener('loadedmetadata', () => { DOM.video.play(); });
        }
        atualizarStatus(`Transmitindo agora: ${canal.nome}`);
    }
}

function gerenciarFavoritos() {
    const url = DOM.video.dataset.currentUrl;
    if (!url) return;
    if (favoritos.includes(url)) {
        favoritos = favoritos.filter(f => f !== url);
        atualizarStatus("Removido dos favoritos.");
    } else {
        favoritos.push(url);
        atualizarStatus("Adicionado aos favoritos.");
    }
    localStorage.setItem('bassetti_tv_favoritos', JSON.stringify(favoritos));
    atualizarBotaoFavoritoUI(url);
    if(filtroAtual === 'FAVORITOS') renderizarCanais();
}

function atualizarBotaoFavoritoUI(url) {
    if (favoritos.includes(url)) {
        DOM.btnFav.textContent = '⭐ Favorito';
        DOM.btnFav.style.backgroundColor = 'rgba(0, 118, 255, 0.3)';
    } else {
        DOM.btnFav.textContent = '☆ Favoritar';
        DOM.btnFav.style.backgroundColor = 'var(--bg-card)';
    }
}

function gerenciarHistorico(url) {
    historico = historico.filter(h => h !== url);
    historico.unshift(url);
    if (historico.length > 20) historico.pop();
    localStorage.setItem('bassetti_tv_historico', JSON.stringify(historico));
}

function atualizarStatus(texto) {
    DOM.statusBar.textContent = `${CONFIG.LOG_PREFIX} ${texto}`;
}
