export function milestoneSortKey(photo) {
  const order = photo?.milestoneSequenceOrder;
  if (order == null || order === '') return 2147483647;
  return Number(order);
}

export function milestoneGroupLabel(photo) {
  if (photo?.milestoneName) {
    const order = photo?.milestoneSequenceOrder;
    if (order != null && order !== '') {
      return `${photo.milestoneName} (step ${order})`;
    }
    return photo.milestoneName;
  }
  return 'General progress (no milestone)';
}

export function groupProgressPhotos(photos) {
  const byProject = new Map();
  for (const photo of photos || []) {
    const pid = String(photo.projectId ?? 'unknown');
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(photo);
  }

  return [...byProject.entries()].map(([projectId, projectPhotos]) => {
    const byMilestone = new Map();
    for (const photo of projectPhotos) {
      const key = photo.milestoneId != null && photo.milestoneId !== ''
        ? String(photo.milestoneId)
        : '__none__';
      if (!byMilestone.has(key)) byMilestone.set(key, []);
      byMilestone.get(key).push(photo);
    }

    const milestoneGroups = [...byMilestone.entries()]
      .map(([key, items]) => ({
        key,
        label: key === '__none__' ? 'General progress (no milestone)' : milestoneGroupLabel(items[0]),
        sortOrder: key === '__none__' ? 2147483647 : milestoneSortKey(items[0]),
        photos: [...items].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

    return {
      projectId,
      projectName: projectPhotos[0]?.projectName || `Project #${projectId}`,
      milestoneGroups,
    };
  });
}

export function isPendingReviewPhoto(photo) {
  const st = String(photo?.status || '').toLowerCase();
  return !st || st.includes('pending') || st.includes('review') || st.includes('submitted');
}
