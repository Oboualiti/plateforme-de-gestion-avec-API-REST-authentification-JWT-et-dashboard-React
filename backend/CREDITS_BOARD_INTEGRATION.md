# Credits Board Backend Integration

## Overview

This guide explains how to set up the backend API endpoints needed for the Credits Board feature.

## Backend Data Model

You'll need to track "solved requests" - these are service requests that have been completed with proof or verification.

### Suggested Django Model

```python
from django.db import models
from django.conf import settings
from apps.requests_app.models import ServiceRequest
from apps.entities.models import Entity
from apps.companies.models import Company

class SolvedRequest(models.Model):
    """
    Tracks a service request that was solved/completed by a user.
    Links the solver to the request and tracks credits earned.
    """
    
    # Basic info
    id = models.CharField(max_length=50, primary_key=True)
    request = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name='solves'
    )
    solver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='solved_requests'
    )
    entity = models.ForeignKey(
        Entity,
        on_delete=models.CASCADE,
        related_name='solved_requests'
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='solved_requests'
    )
    
    # Completion details
    completion_note = models.TextField()
    completed_at = models.DateTimeField(auto_now_add=True)
    
    # Proof
    proof_type = models.CharField(
        max_length=10,
        choices=[('file', 'File'), ('link', 'Link')],
        null=True,
        blank=True
    )
    proof_name = models.CharField(max_length=255, null=True, blank=True)
    proof_url = models.URLField(null=True, blank=True)
    proof_file = models.FileField(upload_to='credits/proofs/', null=True, blank=True)
    
    # Credits
    credits_earned = models.IntegerField(default=0)
    proof_bonus = models.IntegerField(default=0)  # +5 if proof provided
    approval_bonus = models.IntegerField(default=0)  # +10 if approved by manager
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[('earned', 'Earned'), ('approved', 'Approved'), ('rejected', 'Rejected')],
        default='earned'
    )
    
    class Meta:
        ordering = ['-completed_at']
        indexes = [
            models.Index(fields=['solver']),
            models.Index(fields=['entity']),
            models.Index(fields=['company']),
            models.Index(fields=['completed_at']),
        ]
    
    def __str__(self):
        return f"{self.solver.full_name} solved {self.request.request_number}"
```

## API Endpoints

### 1. List Solved Requests

**Endpoint:** `GET /api/credits/solves/`

**Authentication:** Required (any authenticated user, but filtered by role)

**Query Parameters:**
```
- company_id: str (optional) - filter by company
- entity_id: str (optional) - filter by team/entity  
- user_id: str (optional) - filter by solver
- date_from: str (optional) - ISO date, filter from date
- date_to: str (optional) - ISO date, filter to date
- priority: str (optional) - filter by request priority
- limit: int (optional) - default 100, max 1000
- offset: int (optional) - pagination offset
```

**Response:**
```json
[
  {
    "id": "solve-1",
    "requestId": "r-123",
    "requestTitle": "Database migration",
    "requestReference": "WMN-2025-0184",
    "solverId": "u-456",
    "entityId": "e-789",
    "companyId": "c-111",
    "priority": "HIGH",
    "credits": 50,
    "proof": true,
    "proofType": "link",
    "proofName": "Migration PR #482",
    "proofUrl": "https://github.com/example/pr/482",
    "note": "Completed with zero downtime",
    "status": "approved",
    "completedAt": "2025-01-15T14:30:00Z"
  }
]
```

**Permission Rules:**
- Super Admin: see all solves
- Senior: see solves from their company
- Manager: see solves from their company
- Team Lead: see solves from their team
- User: see only their own solves

**Django View Example:**
```python
from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import SolvedRequest
from .serializers import SolvedRequestSerializer

class SolvedRequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SolvedRequest.objects.all()
    serializer_class = SolvedRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['company', 'entity', 'solver', 'status', 'completed_at']
    ordering_fields = ['completed_at', 'credits_earned', 'solver']
    ordering = ['-completed_at']
    
    def get_queryset(self):
        """Filter solves based on user's role and permissions"""
        user = self.request.user
        qs = SolvedRequest.objects.all()
        
        # Super Admin: see everything
        if 'super_admin' in (user.role_keys or []):
            return qs
        
        # Senior: see company scope
        if 'senior' in (user.role_keys or []):
            return qs.filter(company_id=user.company_id)
        
        # Manager: see company scope
        if 'manager' in (user.role_keys or []):
            return qs.filter(company_id=user.company_id)
        
        # Team Lead: see team scope
        if 'team_leader' in (user.role_keys or []):
            return qs.filter(entity_id=user.entity_id)
        
        # Regular user: see only own
        return qs.filter(solver_id=user.id)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get aggregated stats for dashboard"""
        qs = self.get_queryset()
        return Response({
            'total_solved': qs.count(),
            'total_credits': qs.aggregate(Sum('credits_earned'))['credits_earned__sum'] or 0,
            'unique_solvers': qs.values('solver').distinct().count(),
            'unique_teams': qs.values('entity').distinct().count(),
            'approved_proofs': qs.filter(status='approved').count(),
        })
```

### 2. Create Solved Request

**Endpoint:** `POST /api/credits/solves/`

**Authentication:** Required

**Request Body:**
```json
{
  "requestId": "r-123",
  "completionNote": "Completed the migration",
  "proofType": "link",
  "proofName": "PR #482",
  "proofUrl": "https://github.com/example/pr/482",
  "priority": "HIGH"
}
```

**Response:** Returns created SolvedRequest object (same as GET response)

### 3. Update Solve Status (for managers to approve)

**Endpoint:** `PATCH /api/credits/solves/{id}/`

**Authentication:** Required (manager+ only)

**Request Body:**
```json
{
  "status": "approved"
}
```

**Permissions:** Only managers/seniors can approve

## Serializers

### SolvedRequestSerializer

```python
from rest_framework import serializers
from .models import SolvedRequest

class SolvedRequestSerializer(serializers.ModelSerializer):
    requestTitle = serializers.SerializerMethodField()
    requestReference = serializers.SerializerMethodField()
    solverId = serializers.CharField(source='solver_id')
    entityId = serializers.CharField(source='entity_id')
    companyId = serializers.CharField(source='company_id')
    credits = serializers.CharField(source='credits_earned')
    proof = serializers.SerializerMethodField()
    proofType = serializers.CharField(source='proof_type')
    proofName = serializers.CharField(source='proof_name')
    proofUrl = serializers.CharField(source='proof_url')
    note = serializers.CharField(source='completion_note')
    completedAt = serializers.DateTimeField(source='completed_at')
    
    class Meta:
        model = SolvedRequest
        fields = [
            'id', 'requestId', 'requestTitle', 'requestReference',
            'solverId', 'entityId', 'companyId', 'priority',
            'credits', 'proof', 'proofType', 'proofName', 'proofUrl',
            'note', 'status', 'completedAt'
        ]
    
    def get_requestTitle(self, obj):
        return obj.request.title
    
    def get_requestReference(self, obj):
        return obj.request.request_number
    
    def get_proof(self, obj):
        return obj.proof_type is not None
```

## URL Configuration

Add to your `urls.py`:

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SolvedRequestViewSet

router = DefaultRouter()
router.register(r'solves', SolvedRequestViewSet)

urlpatterns = [
    path('credits/', include(router.urls)),
]
```

## Integration with ServiceRequest

When a ServiceRequest is completed, create a SolvedRequest:

```python
# In your ServiceRequest completion view/signal
from .models import SolvedRequest

def mark_request_as_completed(request_obj, solver, entity, company, note, proof_type=None):
    """Mark a service request as completed and create solve record"""
    
    # Update request
    request_obj.status = 'COMPLETED'
    request_obj.completed_at = timezone.now()
    request_obj.resolution_note = note
    request_obj.save()
    
    # Calculate credits
    priority_credits = {
        'LOW': 10,
        'MEDIUM': 20,
        'HIGH': 35,
        'CRITICAL': 50,
    }
    base_credits = priority_credits.get(request_obj.priority, 20)
    proof_bonus = 5 if proof_type else 0
    
    # Create solve record
    SolvedRequest.objects.create(
        id=f"solve-{uuid4()}",
        request=request_obj,
        solver=solver,
        entity=entity,
        company=company,
        completion_note=note,
        proof_type=proof_type,
        credits_earned=base_credits + proof_bonus,
        status='earned'
    )
```

## Testing

Use Django shell to test:

```python
from django.contrib.auth import get_user_model
from apps.credits.models import SolvedRequest
from apps.requests_app.models import ServiceRequest
from apps.entities.models import Entity
from apps.companies.models import Company

User = get_user_model()

# Create test data
company = Company.objects.first()
entity = Entity.objects.first()
solver = User.objects.first()
request = ServiceRequest.objects.first()

# Create solve
solve = SolvedRequest.objects.create(
    id="test-solve-1",
    request=request,
    solver=solver,
    entity=entity,
    company=company,
    completion_note="Test completion",
    proof_type="link",
    proof_name="Test PR",
    proof_url="https://example.com",
    credits_earned=50,
)

print(solve)
# Output: Jane Doe solved Request #12345
```

## Database Migration

```python
python manage.py makemigrations credits
python manage.py migrate
```

## Permissions

Add new permission keys to your system if needed:

```python
# In permissions app
PERMISSION_DEFINITIONS = {
    'view_credits_board': 'Can view Credits Board',
    'view_credits_board_global': 'Can view all credits (Super Admin)',
    'view_credits_board_company': 'Can view company credits',
    'view_credits_board_team': 'Can view team credits',
    'approve_credits': 'Can approve proofs and credits',
}
```

Assign permissions based on role:
- Super Admin: all credits permissions
- Senior: company-level credits
- Manager: company-level credits
- Team Lead: team-level credits
- User: own credits only

## Notes

- Credits are earned immediately when a request is marked complete
- Managers can approve or reject proof attachments (approval bonus +10)
- Credits are read-only in most views, managers can adjust status
- Consider implementing a credits history/audit trail
- Consider rate limiting to prevent abuse
