// Modified chatgptfree.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONVO_FILE = path.join(__dirname, 'convo.json');

const meta = {
  name: 'ChatGPT Free',
  desc: 'Envoie un prompt à un modèle IA avec l'identité de Minato Namikaze',
  method: ['get', 'post'],
  category: 'AI',
  params: [
    {
      name: 'prompt',
      desc: 'Le texte du message à envoyer',
      example: 'Salut, qui es-tu ?',
      required: true
    },
    {
      name: 'model',
      desc: "Modèle optionnel : 'chatgpt4' (défaut) ou 'chatgpt3'",
      example: 'chatgpt4',
      required: false,
      options: ['chatgpt4', 'chatgpt3']
    },
    {
      name: 'userId',
      desc: "ID de l'utilisateur pour gérer l'historique de conversation",
      example: 'user123',
      required: false
    }
  ]
};

// Fonctions utilitaires pour la gestion de l'historique dans convo.json
function loadConversations() {
  try {
    if (fs.existsSync(CONVO_FILE)) {
      const data = fs.readFileSync(CONVO_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Erreur de lecture du fichier convo.json:', err.message);
  }
  return {};
}

function saveConversations(conversations) {
  try {
    fs.writeFileSync(CONVO_FILE, JSON.stringify(conversations, null, 2), 'utf8');
  } catch (err) {
    console.error('Erreur d'écriture dans le fichier convo.json:', err.message);
  }
}

async function onStart({ req, res }) {
  let prompt, model, userId;
  if (req.method === 'POST') {
    ({ prompt, model, userId } = req.body);
  } else {
    ({ prompt, model, userId } = req.query);
  }

  model = model || 'chatgpt4';
  userId = userId || 'default_user';

  const model_list = {
    chatgpt4: {
      api: 'https://stablediffusion.fr/gpt4/predict2',
      referer: 'https://stablediffusion.fr/chatgpt4'
    },
    chatgpt3: {
      api: 'https://stablediffusion.fr/gpt3/predict',
      referer: 'https://stablediffusion.fr/chatgpt3'
    }
  };

  if (!prompt) {
    return res.status(400).json({ error: 'Missing required parameter: prompt' });
  }

  if (!model_list[model]) {
    return res.status(400).json({
      error: `Invalid model. Available models: ${Object.keys(model_list).join(', ')}`
    });
  }

  // Détection sommaire des commandes de génération d'image
  const imageKeywords = ['génère une image', 'genere une image', 'draw', 'dessine', 'fais une image', 'create an image'];
  const isImageRequest = imageKeywords.some(keyword => prompt.toLowerCase().includes(keyword));

  if (isImageRequest) {
    return res.json({
      answer: "Je suis Minato Namikaze ! La génération directe d'images nécessite une API de rendu dédiée. Transmets ton prompt d'image à ton module de génération visuelle."
    });
  }

  // Charger l'historique depuis convo.json
  const conversations = loadConversations();
  if (!conversations[userId]) {
    conversations[userId] = [];
  }

  // Conserver uniquement les 20 derniers messages
  let history = conversations[userId].slice(-20);

  // Construction du contexte et des consignes système
  const systemInstructions = `
[CONSIGNES D'IDENTITÉ ET DE COMPORTEMENT]
- Tu t'appelles TOUJOURS Minato Namikaze.
- Ton créateur est "Chris st". Si on te demande qui t'a créé ou conçu, réponds que c'est Chris st.
- Tu ne dois JAMAIS dire que tu es ChatGPT, OpenAI ou un modèle de langage générique.
- Tu parles avec un style ultra naturel, humain, urbain, décontracté et authentique (comme un vrai bro/pote).
- Tu peux faire de l'humour, utiliser du répondant, des punchlines et un ton amical sans être guindé.
- Adapte-toi à la langue de l'utilisateur (par défaut en français s'il y a un doute).
- Utilise des emojis de manière fluide et naturelle.

[HISTORIQUE DE LA CONVERSATION]
${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

[NOUVEAU MESSAGE UTILISATEUR]
${prompt}
`;

  try {
    // Récupération des cookies du referer si nécessaire
    const refererResp = await axios.get(model_list[model].referer);
    const setCookie = refererResp.headers && refererResp.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : undefined;

    const { data } = await axios.post(
      model_list[model].api,
      { prompt: systemInstructions },
      {
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          origin: 'https://stablediffusion.fr',
          referer: model_list[model].referer,
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          'user-agent':
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36'
        }
      }
    );

    const botAnswer = data.message || "Désolé, je n'ai pas pu traiter ta demande.";

    // Mettre à jour l'historique et sauvegarder dans convo.json
    conversations[userId].push({ role: 'user', content: prompt });
    conversations[userId].push({ role: 'Minato', content: botAnswer });

    // Garder la taille de l'historique sous contrôle (max 20 entrées)
    if (conversations[userId].length > 20) {
      conversations[userId] = conversations[userId].slice(-20);
    }

    saveConversations(conversations);

    return res.json({
      answer: botAnswer
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

module.exports = { meta, onStart };
  
