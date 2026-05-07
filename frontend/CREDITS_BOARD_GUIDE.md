# Credits Board Implementation Guide

## Overview

The Credits Board has been completely redesigned to be **practical and role-aware** rather than game-like. It focuses on:
- **Primary metric**: Requests solved
- **Secondary metric**: Credits earned (optional)
- **Role-based visibility**: Each role sees only what they should

## Features Implemented

### 1. **Data Module** (`src/data/credits.js`)
Simplified credits system with:
- Priority-based credit calculation (LOW: 10, MEDIUM: 20, HIGH: 35, CRITICAL: 50)
- Proof bonus: +5 credits
- Approval bonus: +10 credits
- `filterSolvesByUserRole()` - filters based on user role and permissions
- `buildRoleAwareStats()` - generates role-specific stats
- `rankPeople()` and `rankTeams()` - ranking algorithms

### 2. **Main Page** (`src/pages/CreditsBoard.jsx`)

#### Top Stats (Role-Aware)
- **Super Admin / Senior / Manager**: Team Performance
  - Solved Requests
  - Active Solvers
  - Active Teams
  - Top Team
  
- **Team Lead**: Team Metrics
  - Team Solved
  - My Solved
  - Team Members
  - Top Member
  
- **Support/Dev User**: My Performance
  - Solved Requests
  - Total Credits
  - Proof Submitted
  - Latest Solve

#### Three Tabs with Drill-Down Details

1. **Teams Tab**
   - Shows teams ranked by solved requests
   - Click "View Solves" to see:
     - Team members who solved requests
     - Request details
     - Credits earned
   - Only visible to users with team visibility

2. **People Tab**
   - Shows solvers ranked by solved count
   - Badges: Top Solver, Proof Master
   - Click "View Solves" to see:
     - Person's request details
     - Completion notes
     - Proof indicators

3. **Solved Requests Tab**
   - Table view of all solved requests
   - Sortable by: Date, Solver, Credits
   - Columns:
     - Request (title + ID)
     - Solved by (with avatar)
     - Team
     - Credits
     - Proof status
     - Solved date
     - Details button

#### Recent Solves Section
- Shows 5 most recent solved requests
- Quick view with key info
- Details button for each

### 3. **Details Modal** (`src/components/credits/SolveDetailsModal.jsx`)
Shows complete information about a solved request:
- Solver name and team
- Priority and credits earned
- Completion note
- Proof (file or link)
- Credits breakdown
- Status (earned or approved)

### 4. **Role-Based Visibility**

#### Super Admin
- See all companies, entities, teams
- See all solved requests
- Filter by: company, entity, user, date, request type

#### Senior / Manager
- See their company's solved requests
- See support/dev entities within their company
- Can drill down by entity and user
- Cannot see other companies

#### Team Lead
- See their team's solved requests
- See team members and their solves
- Cannot see other teams (unless permissions allow)

#### Support/Dev User
- See only their own solved requests
- See their own solved count and credits
- No visibility into others' performance

### 5. **Navigation Integration**
Added to sidebar under "Operations" for:
- Super Admin
- Senior
- Manager
- Team Lead

## API Integration

### Required Backend Endpoints

The CreditsBoard expects the following API endpoints to be available:

#### 1. Get Solved Requests
```
GET /api/credits/solves/
```
Returns array of solved requests.

**Query Parameters:**
- `company_id` - filter by company
- `entity_id` - filter by team/entity
- `user_id` - filter by solver
- `date_from` - filter from date
- `date_to` - filter to date
- `priority` - filter by priority

**Response:**
```json
[
  {
    "id": "solve-1",
    "requestId": "r-1",
    "requestTitle": "Database migration",
    "requestReference": "WMN-2025-0184",
    "solverId": "u-123",
    "entityId": "e-456",
    "companyId": "c-789",
    "priority": "HIGH",
    "credits": 50,
    "proof": true,
    "proofType": "link",
    "proofName": "PR #482",
    "proofUrl": "https://...",
    "note": "Completed with zero downtime",
    "status": "approved",
    "completedAt": "2025-01-15T14:30:00Z"
  }
]
```

#### 2. Get Users (already exists)
```
GET /api/users/
```
Returns array of users for displays.

#### 3. Get Entities (already exists)
```
GET /api/entities/
```
Returns array of teams/entities.

### Frontend Configuration

Update the `CreditsBoard.jsx` file to call your actual API endpoints:

```javascript
// Replace mock calls with real API
const solvesRes = await api.get("/credits/solves/");
const usersRes = await api.get("/users/");
const entitiesRes = await api.get("/entities/");
```

## Data Structure

### Solve Object
```typescript
interface Solve {
  id: string;                    // Unique ID
  requestId: string;             // Request reference
  requestTitle: string;          // Request title
  requestReference: string;      // Display reference (e.g., WMN-2025-0186)
  solverId: string;              // User who solved it
  entityId: string;              // Team/entity
  companyId: string;             // Company
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  credits: number;               // Total credits earned
  proof: boolean;                // Has proof attached
  proofType?: "file" | "link";   // Type of proof
  proofName?: string;            // Proof file/link name
  proofUrl?: string;             // Proof URL (for links)
  note: string;                  // Completion note
  status: "earned" | "approved"; // Status
  completedAt: string;           // ISO date
}
```

## Styling

All components use existing design system:
- `border-2 border-ink` - borders
- `shadow-brutal` - shadows
- `bg-surface-1 / bg-surface-2` - backgrounds
- `eyebrow` - section headers
- Existing Badge, Button, Card components
- Existing Avatar component

## Testing

### Mock Data
Use `src/data/mockCreditsData.js` for testing:

```javascript
import { mockSolves, getMockSolves } from "@/data/mockCreditsData";

// In CreditsBoard, replace API call with:
const filtered = getMockSolves(primaryRole, user?.id);
setSolves(filtered);
```

### Test Scenarios
1. Super Admin - should see all
2. Manager/Senior - should see company scope
3. Team Lead - should see team scope
4. User - should see only own solves

## Future Enhancements

1. **Filters**: Add date range, request type filters
2. **Export**: Export solved requests to CSV/PDF
3. **Notifications**: Alert users when they earn credits
4. **Integration**: Link solved requests back to request detail pages
5. **Proof Approval**: Manager can approve/reject proof attachments
6. **Webhooks**: Notify external systems when requests are solved

## Common Issues & Fixes

### Issue: No data appears
**Solution**: Check API endpoints are returning data. Use mock data for testing.

### Issue: Permissions not working
**Solution**: Verify `filterSolvesByUserRole()` logic matches your permission model.

### Issue: Stats not calculating
**Solution**: Check `buildRoleAwareStats()` is receiving filtered solves, not all solves.

## Files Created/Modified

### Created:
- `src/data/credits.js` - Credits system logic
- `src/data/mockCreditsData.js` - Mock data for testing
- `src/pages/CreditsBoard.jsx` - Main page (1300+ lines)
- `src/components/credits/SolveDetailsModal.jsx` - Details modal
- `src/components/credits/` - New directory

### Modified:
- `src/config/nav.js` - Added Credits Board nav items
- `src/routes/AppRoutes.jsx` - Added Credits Board route

## Support

For issues or questions:
1. Check the mock data is correctly structured
2. Verify API endpoints match the expected format
3. Test with Super Admin role first (most permissive)
4. Use browser DevTools to inspect API responses
