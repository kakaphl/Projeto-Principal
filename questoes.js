const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const googleClient = new OAuth2Client('1060653026266-ddgvefd4hrrs7hgmojrkba198ulljmn2.apps.googleusercontent.com');

// Middleware
app.use(express.json());
app.use(cors());

// Conexão com MongoDB Atlas
const MONGODB_URI = 'mongodb+srv://santanastephany220_db_user:s22190309@miaucademy.4mngdrk.mongodb.net/miaucademy?retryWrites=true&w=majority'

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Conectado ao MongoDB Atlas'))
.catch(err => console.error('Erro ao conectar com MongoDB Atlas:', err));

// Schema e Model do Usuário
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false }, // Não obrigatório para usuários Google
    googleId: { type: String, unique: true, sparse: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

//Schema das questões
const questionSchema = new mongoose.Schema({
    Ano: {type: Number, required: true},
    Prova: {type: String, required:true},
    "Área/Conteúdo": {type: String, required: true},
    "Número da Questão": {type: Number, required: true},
    "Enunciado Completo": { type: String, required: true },
    "Alternativa A": String,
    "Alternativa B": String,
    "Alternativa C": String,
    "Alternativa D": String,
    "Alternativa E": String,
    Gabarito: { type: String, required: true },
    "Explicação (Passo a Passo)": { type: String, required: true },
    Status: String,
    linkImagem: String,
  createdAt: { type: Date, default: Date.now }
},{ collection: 'questions' }); // Especifica o nome da coleção
 

const Question = mongoose.model('Question', questionSchema);

//Schema de Tentativas dos usuários 
const attemptSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: String, required: true },
    isCorrect: { type: Boolean, required: true },
    timeSpent: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Attempt = mongoose.model('Attempt', attemptSchema);

//Schema Estatísticas dos usuários 
const userStatsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required:true, unique: true},

//Estatística Geral
    totalQuestionsAttempted: { type: Number, default: 0},
    correctAnswers: {type: Number, default: 0},
    overallAccuracy: { type: Number, default: 0},

    //Por área
    areas: {
        "Interpretação de Texto": {
            attempted: { type: Number, default: 0},
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        "Gêneros textuais": { 
            attempted: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        "Literatura": { 
            attempted: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        }
    },
    
    lastActivity: { type: Date, default: Date.now }
});
        
const UserStats = mongoose.model('UserStats', userStatsSchema);

//Função para atualiar estatísticas 
async function updateUserStats(userId, isCorrect, questionData, timeSpent = 0) {
    try {
        let stats = await UserStats.findOne({ userId });
        if (!stats) {
            stats = new UserStats({ 
                userId,
                areas: {
                    "Interpretação de Texto": { attempted: 0, correct: 0, accuracy: 0 },
                    "Gêneros textuais": { attempted: 0, correct: 0, accuracy: 0 },
                    "Literatura": { attempted: 0, correct: 0, accuracy: 0 }
                }
            });
        }
        
        // Garantir que as áreas existam
        if (!stats.areas) {
            stats.areas = {
                "Interpretação de Texto": { attempted: 0, correct: 0, accuracy: 0 },
                "Gêneros textuais": { attempted: 0, correct: 0, accuracy: 0 },
                "Literatura": { attempted: 0, correct: 0, accuracy: 0 }
            };
        }

        // Atualizar estatísticas gerais
        stats.totalQuestionsAttempted += 1;
        if (isCorrect) stats.correctAnswers += 1;
        stats.overallAccuracy = (stats.correctAnswers / stats.totalQuestionsAttempted) * 100;
        
        // Identificar a área da questão
        const areaConteudo = questionData['Área/Conteúdo'];
        let areaDetectada = null;
        
        // Detectar qual a área de acordo com o Banco de Dados
        if (areaConteudo.includes('Interpretação') || areaConteudo.includes('Interpretacao')) {
            areaDetectada = 'Interpretação de Texto';
        } else if (areaConteudo.includes('Gênero') || areaConteudo.includes('Genero')) {
            areaDetectada = 'Gêneros textuais';
        } else if (areaConteudo.includes('Literatura')) {
            areaDetectada = 'Literatura';
        }
        
        // Atualizar estatísticas da área específica
        if (areaDetectada && stats.areas[areaDetectada]) {
            stats.areas[areaDetectada].attempted += 1;
            if (isCorrect) stats.areas[areaDetectada].correct += 1;
            stats.areas[areaDetectada].accuracy = 
                (stats.areas[areaDetectada].correct / stats.areas[areaDetectada].attempted) * 100;
        }
        
        stats.lastActivity = new Date();
        await stats.save();
        return stats;
        
    } catch (error) {
        console.error('Erro ao atualizar estatísticas:', error);
    }
}

//Middlewares
// Middleware de autenticação 
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'Token de acesso necessário' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token inválido' });
  }
};

// Rotas de Autenticação

// Rota de registro
app.post('/auth/register', async (req, res) => {
    try {
        const { name, username, email, password } = req.body;

        // Verificar se usuário já existe
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                message: 'Usuário ou email já cadastrado' 
            });
        }

        // Criptografar senha
        const hashedPassword = await bcrypt.hash(password, 12);

        // Criar novo usuário
        const newUser = new User({
            name,
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();

        // Gerar token JWT
        const token = jwt.sign(
            { userId: newUser._id, username: newUser.username },
            process.env.JWT_SECRET || 'seu_jwt_secreto_super_seguro', 
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Usuário criado com sucesso',
            token,
            username: newUser.username
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rota de login
app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Encontrar usuário por username ou email
        const user = await User.findOne({
            $or: [{ username }, { email: username }]
        });

        if (!user) {
            return res.status(400).json({ message: 'Usuário não encontrado' });
        }

        // Verificar se é usuário com senha (não usuário Google)
        if (!user.password) {
            return res.status(400).json({ 
                message: 'Este usuário foi registrado via Google. Use o login com Google.' 
            });
        }

        // Verificar senha
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Senha incorreta' });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET || 'seu_jwt_secreto_super_seguro',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login bem-sucedido',
            token,
            username: user.username
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rota de autenticação Google
app.post('/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        
        // Verificar token do Google
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: '1060653026266-ddgvefd4hrrs7hgmojrkba198ulljmn2.apps.googleusercontent.com'
        });
        
        const payload = ticket.getPayload();
        const { sub: googleId, name, email } = payload;

        // Verificar se usuário já existe
        let user = await User.findOne({ 
            $or: [{ googleId }, { email }] 
        });

        if (!user) {
            // Criar username a partir do email
            const username = email.split('@')[0];
            
            // Verificar se username já existe
            let uniqueUsername = username;
            let counter = 1;
            
            while (await User.findOne({ username: uniqueUsername })) {
                uniqueUsername = `${username}${counter}`;
                counter++;
            }

            // Criar novo usuário
            user = new User({
                name,
                username: uniqueUsername,
                email,
                googleId
            });

            await user.save();
        }

        // Gerar token JWT
        const jwtToken = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET || 'seu_jwt_secreto_super_seguro',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login com Google bem-sucedido',
            token: jwtToken,
            username: user.username
        });
    } catch (error) {
        console.error('Erro na autenticação Google:', error);
        res.status(500).json({ message: 'Erro na autenticação Google' });
    }
});

// Rota para verificar token
app.get('/auth/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ valid: false });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu_jwt_secreto_super_seguro');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ valid: false });
        }

        res.json({ valid: true, username: user.username });
    } catch (error) {
        res.status(401).json({ valid: false });
    }
});

// Rota para Questões 

//Buscar questões 
app.get('/api/questions', authenticateToken, async (req, res) => {
    try{
        const { Ano, Prova, areaConteudo, limit = 10, page = 1} = req.query;
        let filter = {};

        if (Ano) filter.Ano = parseInt(Ano);
        if (Prova) filter.Prova = Prova;
        if (areaConteudo) filter["Área/Conteúdo"] = areaConteudo;

        const questions = await Question.find(filter)
            .select({
                Ano: 1,
                Prova: 1,
                "Área/Conteúdo": 1,
                "Número da Questão": 1,
                "Enunciado Completo": 1,
                "Alternativa A": 1,
                "Alternativa B": 1,
                "Alternativa C": 1,
                "Alternativa D": 1,
                "Alternativa E": 1,
                Status: 1,
                _id: 1
            })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .sort({ Ano: -1, "Número da Questão": 1 });

        const total = await Question.countDocuments(filter);

        res.json({
            questions,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            total
        });

    } catch (error) {
         console.error('Erro ao buscar questões:', error);
    res.status(500).json({ error: 'Erro ao buscar questões' });
    }
});

//buscar questão específica 
app.get('/api/questions/:id', authenticateToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.id)
            .select({
                Ano: 1,
                Prova: 1,
                "Área/Conteúdo": 1,
                "Número da Questão": 1,
                "Enunciado Completo": 1,
                "Alternativa A": 1,
                "Alternativa B": 1,
                "Alternativa C": 1,
                "Alternativa D": 1,
                "Alternativa E": 1,
                Status: 1,
                _id: 1
            });
        
        if (!question) {
            return res.status(404).json({ error: 'Questão não encontrada' });
        }
        
        res.json(question);
    } catch (error) {
        console.error('Erro ao buscar questão:', error);
        res.status(500).json({ error: 'Erro ao buscar questão' });
    }
});


//Rota de verificar resposta com estatística
app.post('/api/questions/check-answer', authenticateToken, async (req, res) => {
  try {
    const { questionId, selectedOption, timeSpent = 0} = req.body;
    
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({ error: 'Questão não encontrada' });
    }

    if (!question.Gabarito) {
        return res.status(500).json({
            error: 'Gabarito não encontrado na questão',
            message: 'O campo Gabarito pode ter um nome diferente'
        });
    }

// Extrair a letra correta do gabarito 
    const correctLetter = question.Gabarito.split(')')[0].trim();
    const isCorrect = selectedOption === correctLetter;

//Salvar tentativas no banco 
    const attempt = new Attempt({
        userId: req.user.userId,
        questionId: questionId,
        selectedOption: selectedOption,
        isCorrect: isCorrect,
        timeSpent: timeSpent
    });
    await attempt.save();

//Atualizar estatísticas
    await updateUserStats(req.user.userId, isCorrect, question, timeSpent);
    
    res.json({
      isCorrect,
      correctAnswer: question.Gabarito, //Mostra a resposta certa
      explanation: question['Explicação (Passo a Passo)'] //Mostra a explicação
    });
  } catch (error) {
    console.error('Erro ao verificar resposta:', error);
    res.status(500).json({ error: 'Erro ao verificar resposta' });
  }
});

// Buscar áreas/conteúdos disponíveis
app.get('/api/questions/areas', authenticateToken, async (req, res) => {
  try {
    const areas = await Question.distinct("Área/Conteúdo");
    res.json(areas);
  } catch (error) {
    console.error('Erro ao buscar áreas:', error);
    res.status(500).json({ error: 'Erro ao buscar áreas' });
  }
});

// Buscar anos disponíveis
app.get('/api/questions/anos', authenticateToken, async (req, res) => {
  try {
    const anos = await Question.distinct("Ano");
    res.json(anos.sort((a, b) => b - a));
  } catch (error) {
    console.error('Erro ao buscar anos:', error);
    res.status(500).json({ error: 'Erro ao buscar anos' });
  }
});

// Buscar provas disponíveis
app.get('/api/questions/provas', authenticateToken, async (req, res) => {
  try {
    const provas = await Question.distinct("Prova");
    res.json(provas);
  } catch (error) {
    console.error('Erro ao buscar provas:', error);
    res.status(500).json({ error: 'Erro ao buscar provas' });
  }
});

//Rota de ranking e estatística 
app.get('/api/ranking', authenticateToken, async (req, res) => {
    try {
        const ranking = await UserStats.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user'},
            {
                $project: {
                    name: '$user.name',
                    username: '$user.username',
                    correctAnswers: 1,
                    totalQuestionsAttempted: 1,
                    overallAccuracy: { $round: ['$overallAccuracy', 1] }
                }
            },
            { $sort: { correctAnswers: -1, overallAccuracy: -1}},
            { $limit:20}
        ]);
        res.json(ranking);
    } catch (error) {
        console.error('Erro ao buscar ranking:', error);
        res.status(500).json ({ error: 'Erro ao buscar ranking'});
    }
});
app.get('/api/user/stats/detailed', authenticateToken, async (req, res) => {
    try {
        const stats = await UserStats.findOne({ userId: req.user.userId });
        
        if (!stats) {
            return res.json({
                overallAccuracy: 0,
                areas: {
                    "Interpretação de Texto": { accuracy: 0 },
                    "Gêneros textuais": { accuracy: 0 },
                    "Literatura": { accuracy: 0 }
                }
            });
        }
        
        res.json({
            overallAccuracy: Math.round(stats.overallAccuracy),
            areas: {
                "Interpretação de Texto": { 
                    accuracy: Math.round(stats.areas["Interpretação de Texto"]?.accuracy || 0) 
                },
                "Gêneros textuais": { 
                    accuracy: Math.round(stats.areas["Gêneros textuais"]?.accuracy || 0) 
                },
                "Literatura": { 
                    accuracy: Math.round(stats.areas["Literatura"]?.accuracy || 0) 
                }
            }
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

app.get('/api/user/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await UserStats.findOne({ userId: req.user.userId });
        
        if (!stats) {
            return res.json({
                totalQuestionsAttempted: 0,
                correctAnswers: 0,
                overallAccuracy: 0
            });
        }
        
        res.json({
            totalQuestionsAttempted: stats.totalQuestionsAttempted,
            correctAnswers: stats.correctAnswers,
            overallAccuracy: Math.round(stats.overallAccuracy)
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

//Rota de Status
app.get('/', (req, res) => {
  res.json({ 
    message: ' API Miaucademy funcionando!',
    status: ' Todas as rotas integradas',
    endpoints: {
      auth: [
        'POST /auth/register',
        'POST /auth/login', 
        'POST /auth/google',
        'GET /auth/verify'
      ],
      questions: [
        'GET /api/questions',
        'GET /api/questions/:id',
        'POST /api/questions/check-answer',
        'GET /api/questions/areas',
        'GET /api/questions/anos',
        'GET /api/questions/provas'
      ],
      stats: [
        'GET /api/ranking',
        'GET /api/user/stats',
        'GET /api/user/stats/detailed'
      ]
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Sistema de Questões Integrado`);
    console.log(`http://localhost:${PORT}`);
});