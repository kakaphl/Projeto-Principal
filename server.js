const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3001;
const googleClient = new OAuth2Client('1060653026266-ddgvefd4hrrs7hgmojrkba198ulljmn2.apps.googleusercontent.com');

// Middleware
app.use(express.json());
app.use(cors());

// Conexão com MongoDB Atlas
const MONGODB_URI = 'mongodb+srv://db_santanastephany220_db_user:22190309@miaucademy.4mngdrk.mongodb.net/miaucademy?retryWrites=true&w=majority';

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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});