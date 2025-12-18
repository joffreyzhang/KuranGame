import {
  generateNovel,
  loadNovelData,
  deleteNovel
} from '../services/novelWritingService.js';

export const generateNovelController = async (req, res) => {
  try {
    const {
      sessionId,
      novelId,
      title,
      theme,
      chapterCount,
      style,
      language
    } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    // Generate novel
    const novelData = await generateNovel(
      sessionId,
      {
        novelId,
        title: title || 'Untitled Novel',
        theme: theme || 'adventure',
        chapterCount: parseInt(chapterCount) || 1,
        style: style || 'literary',
        language: language || 'Chinese'
      }
    );

    res.json({
      success: true,
      message: 'Novel generated successfully',
      data: {
        novelId: novelData.novelId,
        title: novelData.metadata.title,
        theme: novelData.metadata.theme,
        style: novelData.metadata.style,
        language: novelData.metadata.language,
        chapterCount: novelData.metadata.chapterCount,
        totalWordCount: novelData.metadata.totalWordCount,
        tokenUsage: novelData.tokenUsage,
        chapters: novelData.chapters.map(ch => ({
          id: ch.id,
          number: ch.number,
          title: ch.title,
          wordCount: ch.wordCount,
          preview: ch.content.substring(0, 200) + '...'
        })),
        createdAt: novelData.createdAt
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating novel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate novel',
      message: error.message
    });
  }
};




export const getNovelController = async (req, res) => {
  try {
    const { sessionId, novelId } = req.params;
    const { includeContent } = req.query;

    if (!sessionId || !novelId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and novelId are required'
      });
    }

    const novelData = loadNovelData(sessionId, novelId);

    if (!novelData) {
      return res.status(404).json({
        success: false,
        error: 'Novel not found'
      });
    }

    // Optionally exclude full content for lighter response
    const responseData = {
      ...novelData
    };

    if (includeContent !== 'true') {
      responseData.chapters = novelData.chapters.map(ch => ({
        id: ch.id,
        number: ch.number,
        title: ch.title,
        wordCount: ch.wordCount,
        createdAt: ch.createdAt,
        preview: ch.content.substring(0, 200) + '...'
      }));
      delete responseData.rawContent;
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error getting novel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve novel',
      message: error.message
    });
  }
};


export const getChapterController = async (req, res) => {
  try {
    const { sessionId, novelId, chapterNumber } = req.params;

    if (!sessionId || !novelId || !chapterNumber) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, novelId, and chapterNumber are required'
      });
    }

    const novelData = loadNovelData(sessionId, novelId);

    if (!novelData) {
      return res.status(404).json({
        success: false,
        error: 'Novel not found'
      });
    }

    const chapter = novelData.chapters.find(
      ch => ch.number === parseInt(chapterNumber)
    );

    if (!chapter) {
      return res.status(404).json({
        success: false,
        error: 'Chapter not found'
      });
    }

    res.json({
      success: true,
      data: {
        chapter
      }
    });
  } catch (error) {
    console.error('Error getting chapter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chapter',
      message: error.message
    });
  }
};

export const deleteNovelController = async (req, res) => {
  try {
    const { sessionId, novelId } = req.params;

    if (!sessionId || !novelId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and novelId are required'
      });
    }

    const deleted = deleteNovel(sessionId, novelId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Novel not found'
      });
    }

    res.json({
      success: true,
      message: 'Novel deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting novel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete novel',
      message: error.message
    });
  }
};
