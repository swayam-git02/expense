const express = require("express");

const authMiddleware = require("../middleware/auth");
const { all, get, run } = require("../config/db");

const router = express.Router();

router.use(authMiddleware);

router.get("/participants", async (req, res, next) => {
  try {
    const participants = await all(
      `
        SELECT id, user_id, name, email
        FROM participants
        WHERE user_id = ?
        ORDER BY id DESC
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: participants,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/participants", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim();

    if (name.length < 2) {
      res.status(400).json({
        success: false,
        message: "Participant name is required",
      });
      return;
    }

    const insertResult = await run(
      `
        INSERT INTO participants (user_id, name, email)
        VALUES (?, ?, ?)
      `,
      [userId, name, email]
    );

    const participant = await get(
      `
        SELECT id, user_id, name, email
        FROM participants
        WHERE id = ?
      `,
      [insertResult.id]
    );

    res.status(201).json({
      success: true,
      message: "Participant added",
      data: participant,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/participants/:id", async (req, res, next) => {
  try {
    const participantId = Number(req.params.id);
    if (!participantId) {
      res.status(400).json({
        success: false,
        message: "Invalid participant id",
      });
      return;
    }

    const deleteResult = await run(
      "DELETE FROM participants WHERE id = ? AND user_id = ?",
      [participantId, req.user.id]
    );

    if (!deleteResult.changes) {
      res.status(404).json({
        success: false,
        message: "Participant not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Participant removed",
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/participants", async (req, res, next) => {
  try {
    await run("DELETE FROM participants WHERE user_id = ?", [req.user.id]);
    res.json({
      success: true,
      message: "All participants removed",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const title = String(req.body.title || "").trim();
    const amount = Number(req.body.amount || 0);
    const paidBy = String(req.body.paidBy || req.body.paid_by || "").trim();
    const participants = req.body.participants ?? [];
    const splitType = String(req.body.splitType || req.body.split_type || "").trim();
    const date = String(req.body.date || "").trim();

    if (!title || !paidBy || !splitType || !date || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid split payload",
      });
      return;
    }

    const participantsJson = JSON.stringify(participants);
    const insertResult = await run(
      `
        INSERT INTO split (user_id, title, amount, paid_by, participants, split_type, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [userId, title, amount, paidBy, participantsJson, splitType, date]
    );

    const splitRecord = await get(
      `
        SELECT id, user_id, title, amount, paid_by, participants, split_type, date
        FROM split
        WHERE id = ?
      `,
      [insertResult.id]
    );

    res.status(201).json({
      success: true,
      message: "Split expense saved",
      data: {
        ...splitRecord,
        participants: safeParticipantsParse(splitRecord.participants),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const records = await all(
      `
        SELECT id, user_id, title, amount, paid_by, participants, split_type, date
        FROM split
        WHERE user_id = ?
        ORDER BY date DESC, id DESC
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: records.map((record) => ({
        ...record,
        participants: safeParticipantsParse(record.participants),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const splitId = Number(req.params.id);
    if (!splitId) {
      res.status(400).json({
        success: false,
        message: "Invalid split id",
      });
      return;
    }

    const deleteResult = await run(
      "DELETE FROM split WHERE id = ? AND user_id = ?",
      [splitId, req.user.id]
    );

    if (!deleteResult.changes) {
      res.status(404).json({
        success: false,
        message: "Split record not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Split record deleted",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

function safeParticipantsParse(value) {
  try {
    return JSON.parse(value || "[]");
  } catch (error) {
    return [];
  }
}
