// src/hooks/useStrategicPlanDetails.jsx
import { useState, useEffect, useCallback } from 'react';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { checkUserPrivilege } from '../utils/helpers';

const useStrategicPlanDetails = (planId) => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [strategicPlan, setStrategicPlan] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [subprograms, setSubprograms] = useState([]);
  const [annualWorkPlans, setAnnualWorkPlans] = useState([]);
  const [activities, setActivities] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [milestones, setMilestones] = useState([]); // EXISTING: Milestones state
  const [milestoneActivities, setMilestoneActivities] = useState([]); // NEW: State for linked activities

  const fetchStrategicPlanData = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (authLoading) return;

    if (!user || !checkUserPrivilege(user, 'strategic_plan.read_all')) {
      setError('You don\'t have permission to view strategic plan details.');
      setLoading(false);
      return;
    }

    try {
      // Step 1: Fetch the main strategic plan data.
      const planData = await apiService.strategy.getStrategicPlanById(planId);
      setStrategicPlan(planData);

      // Step 2: Fetch the plan-level collections in bulk.
      const [
        programsData,
        allSubprograms,
        workPlansResults,
        attachmentsData,
        milestonesData,
      ] = await Promise.all([
        apiService.strategy.getProgramsByPlanId(planData.cidpid),
        apiService.strategy.getSubprogramsByPlanId(planData.cidpid),
        apiService.strategy.annualWorkPlans.getWorkPlansByPlanId(planData.cidpid),
        apiService.strategy.getPlanningDocumentsForEntity('plan', planId),
        apiService.milestones.getMilestonesForProject(planId),
      ]);
      setPrograms(programsData);
      setSubprograms(allSubprograms);
      setAnnualWorkPlans(workPlansResults);
      setAttachments(attachmentsData);
      setMilestones(milestonesData);
      setActivities([]);
      setMilestoneActivities([]);

    } catch (err) {
      console.error('Error fetching strategic plan details:', err);
      setError(err.message || 'Failed to load strategic plan details.');
    } finally {
      setLoading(false);
    }
  }, [planId, user, authLoading]);

  useEffect(() => {
    fetchStrategicPlanData();
  }, [fetchStrategicPlanData]);

  return {
    strategicPlan, programs, subprograms, annualWorkPlans, activities, attachments, milestones, milestoneActivities,
    loading, error, fetchStrategicPlanData
  };
};

export default useStrategicPlanDetails;