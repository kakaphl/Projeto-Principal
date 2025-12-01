const express = require('express');
const router = express.Router();
const Question = require('../models/Question');

router.get('/api/questions', async (req, res) => {
  try {
    const questions = await Question.find().limit(50);
    res.json(questions);
  } catch (error) {
    console.error('Erro ao buscar questões:', error);
    res.status(500).json({ erro: 'Erro ao buscar questões' });
  }
});

module.exports = router;