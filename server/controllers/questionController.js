const Question = require('../models/Question');
const User = require('../models/User');

// @desc    Get all questions
// @route   GET /api/questions
// @access  Public
const getQuestions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { search, tag, sort } = req.query;
    
    let query = { isActive: true };
    
    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    // Tag filter
    if (tag) {
      query.tags = { $in: [tag] };
    }
    
    // Sort options
    let sortOption = {};
    switch (sort) {
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'votes':
        sortOption = { 'votes.length': -1 };
        break;
      case 'views':
        sortOption = { views: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }
    
    const questions = await Question.find(query)
      .populate('author', 'username avatar reputation')
      .populate('acceptedAnswer')
      .sort(sortOption)
      .skip(skip)
      .limit(limit);
    
    const total = await Question.countDocuments(query);
    
    res.json({
      questions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single question
// @route   GET /api/questions/:id
// @access  Public
const getQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('author', 'username avatar reputation')
      .populate({
        path: 'answers',
        populate: {
          path: 'author',
          select: 'username avatar reputation'
        }
      });

    if (question) {
      // Increment views
      question.views += 1;
      await question.save();
      
      res.json(question);
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new question
// @route   POST /api/questions
// @access  Private
const createQuestion = async (req, res) => {
  try {
    const { title, description, tags } = req.body;

    const question = await Question.create({
      title,
      description,
      tags: tags.map(tag => tag.toLowerCase()),
      author: req.user._id
    });

    // Add question to user's questionsAsked array
    await User.findByIdAndUpdate(req.user._id, {
      $push: { questionsAsked: question._id }
    });

    const populatedQuestion = await Question.findById(question._id)
      .populate('author', 'username avatar reputation');

    res.status(201).json(populatedQuestion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update question
// @route   PUT /api/questions/:id
// @access  Private
const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);

    if (question) {
      // Check if user owns the question
      if (question.author.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      question.title = req.body.title || question.title;
      question.description = req.body.description || question.description;
      question.tags = req.body.tags ? req.body.tags.map(tag => tag.toLowerCase()) : question.tags;

      const updatedQuestion = await question.save();
      res.json(updatedQuestion);
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete question
// @route   DELETE /api/questions/:id
// @access  Private
const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);

    if (question) {
      // Check if user owns the question or is admin
      if (question.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }

      question.isActive = false;
      await question.save();
      res.json({ message: 'Question deleted' });
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Vote on question
// @route   PUT /api/questions/:id/vote
// @access  Private
const voteQuestion = async (req, res) => {
  try {
    const { type } = req.body; // 'upvote' or 'downvote'
    const question = await Question.findById(req.params.id);

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Check if user already voted
    const existingVoteIndex = question.votes.findIndex(
      vote => vote.user.toString() === req.user._id.toString()
    );

    if (existingVoteIndex !== -1) {
      // User already voted, update or remove vote
      if (question.votes[existingVoteIndex].type === type) {
        // Remove vote if same type
        question.votes.splice(existingVoteIndex, 1);
      } else {
        // Update vote type
        question.votes[existingVoteIndex].type = type;
      }
    } else {
      // Add new vote
      question.votes.push({
        user: req.user._id,
        type
      });
    }

    await question.save();
    res.json({ message: 'Vote updated', voteCount: question.voteCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get popular tags
// @route   GET /api/questions/tags
// @access  Public
const getPopularTags = async (req, res) => {
  try {
    const tags = await Question.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    res.json(tags);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  voteQuestion,
  getPopularTags
};
