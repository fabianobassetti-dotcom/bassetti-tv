// Estado Global da Aplicação
let totalCanais = [];
let favoritos = JSON.parse(localStorage.getItem('bassetti_tv_favoritos')) || [];
let historico = JSON.parse(localStorage.getItem('bassetti_tv_historico')) || [];
let filtroAtual = 'TODOS'; // TODOS, FAVORITOS, HISTORICO
let categoriaSelecionada = 'TODOS';
let hlsInstance = null;

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

    // Abas de Filtros Topo da Sidebar
    DOM.tabTodos.addEventListener('click', () => alternarFiltro('TODOS', DOM.tabTodos));
    DOM.tabFavs.addEventListener('click', () => alternarFiltro('FAVORITOS', DOM.tabFavs));
    DOM.tabHist.addEventListener('click', () => alternarFiltro('HISTORICO', DOM.tabHist));

    // Botão Favoritar
    DOM.btnFav.addEventListener('click', gerenciarFavoritos);
}

function alternarFiltro(tipo, elementoBotao) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    elementoBotao.classList.add('active');
    filtroAtual = tipo;
    renderizarCanais();
}

// Consome e processa o arquivo M3U gerado pelo Hub
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
        DOM.channelsList.innerHTML = `<div class="loading-message" style="color: #ff4a4a;">Erro ao carregar canais. Verifique a URL do Hub.</div>`;
        atualizarStatus("Erro crítico na importação da playlist.");
    }
}

// Parser M3U simples e otimizado para o formato do Hub
function parseM3U(dadosBrutos) {
    const linhas = dadosBrutos.split('\n');
    let canalAtual = null;

    for (let i = 0; i < linhas.length; i++) {
        let linha = linhas[i].trim();
        
        if (linha.startsWith('#EXTINF:')) {
            canalAtual = {};
            
            // Regex para captura das chaves/atributos M3U
            const logoMatch = linha.match(/tvg-logo="([^"]*)"/);
            const groupMatch = linha.match(/group-title="([^"]*)"/);
            
            // O nome do canal vem logo após a última vírgula do #EXTINF
            const virgulaIndex = linha.lastIndexOf(',');
            const nomeCanal = virgulaIndex !== -1 ? linha.substring(virgulaIndex + 1).stripOrNormal() : "Canal Sem Nome";

            canalAtual.nome = nomeCanal;
            canalAtual.logo = logoMatch ? logoMatch[1] : '';
            canalAtual.grupo = groupMatch ? groupMatch[1].toUpperCase() : 'OUTROS';
        } else if (linha && !linha.startsWith('#') && canalAtual) {
            canalAtual.url = linha;
            totalCanais.push(canalAtual);
            canalAtual = null; // Reseta ponteiro
        }
    }
}

// Extensão utilitária para strings
String.prototype.stripOrNormal = function() {
    return this.trim();
};

function popularCategorias() {
    const gruposUnicos = new Set(totalCanais.map(c => c.grupo));
    // Garante ordenação alfabética, mas mantendo a estrutura limpa
    const gruposOrdenados = Array.from(gruposUnicos).sort();
    
    // Força BRAZIL no topo da combobox se existir
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

    // Aplica Filtro Superior das Abas
    if (filtroAtual === 'FAVORITOS') {
        canaisFiltrados = canaisFiltrados.filter(c => favoritos.includes(c.url));
    } else if (filtroAtual === 'HISTORICO') {
        canaisFiltrados = historico.map(url => totalCanais.find(c => c.url === url)).filter(Boolean);
    }

    // Aplica Filtro da Select Box de Categorias
    if (categoriaSelecionada !== 'TODOS' && filtroAtual === 'TODOS') {
        canaisFiltrados = canaisFiltrados.filter(c => c.grupo === categoriaSelecionada);
    }

    // Aplica Filtro de Busca por Texto
    if (busca) {
        canaisFiltrados = canaisFiltrados.filter(c => c.nome.toLowerCase().includes(busca));
    }

    if (canaisFiltrados.length === 0) {
        DOM.channelsList.innerHTML = '<div class="loading-message">Nenhum canal localizado.</div>';
        return;
    }

    canaisFiltrados.forEach(canal => {
        const item = document.createElement('div');
        item.className = 'channel-item';
        if (DOM.video.dataset.currentUrl === canal.url) item.classList.add('active');

        const imgPlaceholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>';

        item.innerHTML = `
            <img class="channel-logo" src="${canal.logo || imgPlaceholder}" onerror="this.src='${imgPlaceholder}'" alt="">
            <div class="channel-info">
                <div class="channel-name">${canal.nome}</div>
                <div class="channel-group">${canal.grupo}</div>
            </div>
        `;

        item.addEventListener('click', () => carregarCanalNoPlayer(canal));
        DOM.channelsList.appendChild(item);
    });
}

function carregarCanalNoPlayer(canal) {
    // Atualiza estado do DOM do item ativo
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    DOM.video.dataset.currentUrl = canal.url;
    renderizarCanais(); // Refaz lista para persistir marcador visual

    // Atualiza metadados do Rodapé do Player
    DOM.placeholder.classList.add('hidden');
    DOM.currentTitle.textContent = canal.nome;
    DOM.currentGroup.textContent = canal.grupo;
    if (canal.logo) {
        DOM.currentLogo.src = canal.logo;
        DOM.currentLogo.classList.remove('hidden');
    } else {
        DOM.currentLogo.classList.add('hidden');
    }

    // Gerencia exibição do botão favoritar
    DOM.btnFav.classList.remove('hidden');
    atualizarBotaoFavoritoUI(canal.url);

    // Salva no Histórico
    gerenciarHistorico(canal.url);

    // Gerenciamento de Engine HLS.js
    if (Hls.isSupported()) {
        if (hlsInstance) hlsInstance.destroy(); // Libera buffer anterior
        
        hlsInstance = new Hls({
            maxBufferLength: 10,
            enableWorker: true
        });
        hlsInstance.loadSource(canal.url);
        hlsInstance.attachMedia(DOM.video);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            DOM.video.play();
        });
        hlsInstance.on(Hls.Events.ERROR, function (evento, dados) {
            if (dados.fatal) {
                atualizarStatus(`Erro de rede ou mídia ao abrir: ${canal.nome}`);
            }
        });
    } 
    // Suporte Nativo (Apple Safari / iOS Safari)
    else if (DOM.video.canPlayType('application/vnd.apple.mpegurl')) {
        DOM.video.src = canal.url;
        DOM.video.addEventListener('loadedmetadata', () => {
            DOM.video.play();
        });
    }

    atualizarStatus(`Transmitindo agora: ${canal.nome}`);
}

// Funções Helpers e Armazenamentos Locais
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
    historico = historico.filter(h => h !== url); // Remove duplicatas antigas
    historico.unshift(url); // Coloca no topo
    if (historico.length > 20) historico.pop(); // Limita a 20 itens no histórico
    localStorage.setItem('bassetti_tv_historico', JSON.stringify(historico));
}

function atualizarStatus(texto) {
    DOM.statusBar.textContent = `${CONFIG.LOG_PREFIX} ${texto}`;
}
