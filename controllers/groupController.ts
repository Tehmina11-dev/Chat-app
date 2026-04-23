import type { Request, Response } from "express";
import { db } from "../utils/db.js";
import type { Group, GroupMember } from "../models/types.js";

// 🏘️ CREATE GROUP
export const createGroup = async (req: Request, res: Response) => {
  const { name, created_by, member_ids }: { name: string; created_by: number; member_ids: number[] } = req.body;

  // Validation
  if (!name || !created_by || !member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
    return res.status(400).json({ error: "Missing required fields: name, created_by, member_ids (array)" });
  }

  // Ensure created_by is in member_ids
  if (!member_ids.includes(created_by)) {
    member_ids.push(created_by);
  }

  try {
    // Start transaction
    await db.query('BEGIN');

    // Insert group
    const groupResult = await db.query(
      `INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING *`,
      [name, created_by]
    );

    const group: Group = groupResult.rows[0];

    // Insert group members
    const memberValues = member_ids.map(user_id => `(${group.id}, ${user_id})`).join(', ');
    await db.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ${memberValues}`
    );

    // Commit transaction
    await db.query('COMMIT');

    return res.status(201).json({
      message: "Group created successfully",
      data: {
        group,
        members: member_ids
      }
    });
  } catch (err: any) {
    // Rollback on error
    await db.query('ROLLBACK');
    console.error("Create Group Error:", err);

    return res.status(500).json({
      error: "Failed to create group",
      details: err.message,
    });
  }
};

// 📜 GET GROUP MESSAGES
export const getGroupMessages = async (req: Request, res: Response) => {
  const { groupId } = req.params;

  if (!groupId) {
    return res.status(400).json({ error: "Missing groupId parameter" });
  }

  try {
    const result = await db.query(
      `SELECT m.*, u.username as sender_name
       FROM messages m
       JOIN auth u ON m.sender_id = u.id
       WHERE m.group_id = $1
       ORDER BY m.created_at ASC`,
      [groupId]
    );

    return res.json({
      groupId: Number(groupId),
      messages: result.rows
    });
  } catch (err: any) {
    console.error("Get Group Messages Error:", err);

    return res.status(500).json({
      error: "Failed to fetch group messages",
      details: err.message,
    });
  }
};

// 👥 GET USER GROUPS
export const getUserGroups = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }

  try {
    const result = await db.query(
      `SELECT g.*, gm.joined_at
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    return res.json(result.rows);
  } catch (err: any) {
    console.error("Get User Groups Error:", err);

    return res.status(500).json({
      error: "Failed to fetch user groups",
      details: err.message,
    });
  }
};