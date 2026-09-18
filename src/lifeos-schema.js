export const LIFEOS_RESPONSE_TYPES = {
  MESSAGE: "message",
  DAILY_PLAN: "daily_plan",
  TASK: "task",
  REPLAN: "replan",
  SUGGESTION: "suggestion"
};

export const LIFEOS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [
        "message",
        "daily_plan",
        "task",
        "replan",
        "suggestion"
      ]
    },

    title: {
      type: ["string", "null"]
    },

    subtitle: {
      type: ["string", "null"]
    },

    message: {
      type: ["string", "null"]
    },

    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string"
          },

          time: {
            type: ["string", "null"]
          },

          title: {
            type: "string"
          },

          duration: {
            type: ["number", "null"]
          },

          priority: {
            type: "string",
            enum: ["low", "medium", "high"]
          },

          status: {
            type: "string",
            enum: [
              "pending",
              "completed",
              "missed",
              "in_progress"
            ]
          }
        },

        required: [
          "id",
          "title",
          "priority",
          "status"
        ]
      }
    },

    suggestions: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },

  required: [
    "type",
    "title",
    "subtitle",
    "message",
    "tasks",
    "suggestions"
  ]
};
