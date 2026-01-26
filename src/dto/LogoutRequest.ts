/**
 * Logout request DTO - Token should be in Authorization header
 * This is kept for backwards compatibility
 * @swagger
 * components:
 *   schemas:
 *     LogoutRequest:
 *       type: object
 *       properties:
 *         note:
 *           type: string
 *           example: "Token should be sent in Authorization header"
 */
export class LogoutRequest {
  // Token will be extracted from Authorization header
  // This DTO can be empty or contain additional logout-related data
}
