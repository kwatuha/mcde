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

      // Step 2: Fetch the programs associated with this specific plan.
      const programsData = await apiService.strategy.getProgramsByPlanId(planData.cidpid);
      setPrograms(programsData);

      // Step 3: Fetch all subprograms.
      const allSubprograms = (await Promise.all(
        programsData.map(program =>
          apiService.strategy.getSubprogramsByProgramId(program.programId)
        )
      )).flat();
      setSubprograms(allSubprograms);

      // Step 4: Fetch all work plans for all subprograms.
      const workPlansPromises = allSubprograms.map(subprogram => 
          apiService.strategy.annualWorkPlans.getWorkPlansBySubprogramId(subprogram.subProgramId)
      );
      const workPlansResults = (await Promise.all(workPlansPromises)).flat();
      setAnnualWorkPlans(workPlansResults);

      // Step 5: Fetch all activities for all work plans.
      const activitiesPromises = workPlansResults.map(workplan =>
          apiService.strategy.activities.getActivitiesByWorkPlanId(workplan.workplanId)
      );
      const activitiesResults = (await Promise.all(activitiesPromises)).flat();
      setActivities(activitiesResults);
      
      // Step 6: Fetch attachments for the plan.
      const attachmentsData = await apiService.strategy.getPlanningDocumentsForEntity('plan', planId);
      setAttachments(attachmentsData);
      
      // Step 7: Fetch all milestones for the project.
      const milestonesData = await apiService.milestones.getMilestonesForProject(planId);
      setMilestones(milestonesData);

      // NEW: Step 8: Fetch all activities for each milestone.
      let milestoneActivitiesResults = [];
      if (milestonesData && milestonesData.length > 0) {
        try {
          const milestoneActivitiesPromises = milestonesData.map(milestone =>
            apiService.strategy.milestoneActivities.getActivitiesByMilestoneId(milestone.milestoneId).catch(err => {
              console.warn(`Error fetching activities for milestone ${milestone.milestoneId}:`, err);
              return []; // Return empty array on error
            })
          );
          milestoneActivitiesResults = (await Promise.all(milestoneActivitiesPromises)).flat();
        } catch (err) {
          console.warn('Error fetching milestone activities:', err);
          milestoneActivitiesResults = [];
        }
      }
      setMilestoneActivities(milestoneActivitiesResults);

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