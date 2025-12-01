const express = require('express');
const mongoose = require('mongoose'); // Banco de dados na nuvem
const bcrypt = require('bcryptjs'); // Criptografia de senhas
const jwt = require('jsonwebtoken'); // Sistema de autenticação seguro
const cors = require('cors');  // Comunicação entre front-end e back-end
const { OAuth2Client } = require('google-auth-library'); // Login com Google
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const googleClient = new OAuth2Client('1060653026266-ddgvefd4hrrs7hgmojrkba198ulljmn2.apps.googleusercontent.com');

// Middleware
app.use(express.json());
app.use(cors());

// Conexão com MongoDB Atlas
const MONGODB_URI = 'mongodb+srv://santanastephany220_db_user:22190309@miaucademy.4mngdrk.mongodb.net/miaucademy?retryWrites=true&w=majority'

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

// Schema das questões
const questionSchema = new mongoose.Schema({
    Ano: { type: Number, required: true },
    Prova: { type: String, required: true },
    "Área/Conteúdo": { type: String, required: true },
    "Número da Questão": { type: Number, required: true },
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
    Banca: String, // Adicionado para compatibilidade com os filtros
    Nível: String, // Adicionado para compatibilidade com os filtros
    createdAt: { type: Date, default: Date.now }
}, { collection: 'questions' });

const Question = mongoose.model('Question', questionSchema);

// Middleware de autenticação (OPCIONAL para questões públicas)
const authenticateToken = (req, res, next) => {
    // Verifica se a rota é pública (questões)
    const publicRoutes = ['/api/questions', '/api/questions/filter'];
    
    if (publicRoutes.includes(req.path) && req.method === 'GET') {
        // Permite acesso sem autenticação para visualização de questões
        return next();
    }
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Token de acesso necessário' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu_jwt_secreto_super_seguro');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Token inválido' });
    }
};

// Rota PÚBLICA para buscar questões (sem autenticação obrigatória)
app.get('/api/questions', async (req, res) => {
    try {
        // Parâmetros de filtro
        const { disciplina, assunto, banca, tipo, limit = 50, page = 1 } = req.query;
        let filter = {};

        // Aplicar filtros
        if (disciplina && disciplina !== 'Selecionar') {
            filter["Área/Conteúdo"] = new RegExp(disciplina, 'i');
        }
        if (assunto && assunto !== 'Selecionar') {
            filter["Prova"] = new RegExp(assunto, 'i');
        }
        if (banca && banca !== 'Selecionar') {
            // Se você tiver campo Banca no banco, use:
            // filter["Banca"] = new RegExp(banca, 'i');
            // Senão, filtre por Prova que geralmente contém a banca
            filter["Prova"] = new RegExp(banca, 'i');
        }

        console.log('Filtro aplicado:', filter);

        // Buscar questões
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
                Gabarito: 1,
                "Explicação (Passo a Passo)": 1,
                Status: 1,
                Banca: 1,
                Nível: 1,
                _id: 1
            })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .sort({ Ano: -1, "Número da Questão": 1 });

        // Contar total
        const total = await Question.countDocuments(filter);

        res.json(questions); // Retorna apenas o array de questões para compatibilidade

    } catch (error) {
        console.error('Erro ao buscar questões:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar questões',
            details: error.message 
        });
    }
});

// Rota de FILTRO alternativa (para sua página HTML)
app.get('/api/questions/filter', async (req, res) => {
    try {
        // Parâmetros de filtro
        const { disciplina, assunto, banca, tipo } = req.query;
        let filter = {};

        // Aplicar filtros
        if (disciplina && disciplina !== 'Selecionar') {
            filter["Área/Conteúdo"] = new RegExp(disciplina, 'i');
        }
        if (assunto && assunto !== 'Selecionar') {
            filter["Prova"] = new RegExp(assunto, 'i');
        }
        if (banca && banca !== 'Selecionar') {
            filter["Prova"] = new RegExp(banca, 'i'); // Ou use campo Banca se existir
        }

        console.log('Filtro (rota /filter):', filter);

        // Buscar questões
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
                Gabarito: 1,
                "Explicação (Passo a Passo)": 1,
                Status: 1,
                Banca: 1,
                Nível: 1,
                _id: 1
            })
            .limit(50) // Limite maior para filtros
            .sort({ Ano: -1, "Número da Questão": 1 });

        res.json(questions);

    } catch (error) {
        console.error('Erro ao filtrar questões:', error);
        res.status(500).json({ 
            error: 'Erro ao filtrar questões',
            details: error.message 
        });
    }
});

// Rota para opções de filtro (para preencher os dropdowns)
app.get('/api/filters/options', async (req, res) => {
    try {
        const [disciplinas, bancas, anos] = await Promise.all([
            Question.distinct("Área/Conteúdo"),
            Question.distinct("Prova"),
            Question.distinct("Ano")
        ]);

        res.json({
            disciplinas: disciplinas.filter(d => d).sort(),
            bancas: bancas.filter(b => b).sort(),
            anos: anos.filter(a => a).sort((a, b) => b - a),
            tipos: ["Múltipla Escolha", "Discursiva", "Verdadeiro/Falso"] // Valores fixos
        });
    } catch (error) {
        console.error('Erro ao buscar opções de filtro:', error);
        res.status(500).json({ error: 'Erro ao buscar opções de filtro' });
    }
});

// Buscar questão específica
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
                Gabarito: 1,
                "Explicação (Passo a Passo)": 1,
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

// Verificar resposta
app.post('/api/questions/check-answer', authenticateToken, async (req, res) => {
    try {
        const { questionId, selectedOption } = req.body;
       
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
       
        res.json({
            isCorrect,
            correctAnswer: question.Gabarito,
            explanation: question['Explicação (Passo a Passo)']
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

// Rotas de Autenticação (mantidas do seu código original)

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
            // gerar username a partir do email
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

// Rota de Status
app.get('/', (req, res) => {
    res.json({
        message: 'API Miaucademy funcionando!',
        status: 'Todas as rotas integradas',
        endpoints: {
            auth: [
                'POST /auth/register',
                'POST /auth/login',
                'POST /auth/google',
                'GET /auth/verify'
            ],
            questions: [
                'GET /api/questions (PÚBLICA)',
                'GET /api/questions/filter (PÚBLICA)',
                'GET /api/filters/options (PÚBLICA)',
                'GET /api/questions/:id',
                'POST /api/questions/check-answer',
                'GET /api/questions/areas',
                'GET /api/questions/anos',
                'GET /api/questions/provas'
            ]
        }
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Sistema de Questões Integrado`);
    console.log(`http://localhost:${PORT}`);
    console.log(`\nRotas públicas de questões disponíveis:`);
    console.log(`- GET /api/questions`);
    console.log(`- GET /api/questions/filter`);
    console.log(`- GET /api/filters/options`);
});