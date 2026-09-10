import React from 'react';
import type { Job, JobStatus } from '../../types/job';
import { Dialog, DialogContent } from '../ui/dialog';
import { JobDetailInspector } from './JobDetailInspector';

interface JobDetailModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (job: Job, status: JobStatus) => Promise<void>;
  isUpdating?: boolean;
  userEmail?: string | null;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  job,
  isOpen,
  onClose,
  onUpdateStatus,
  isUpdating = false,
  userEmail,
}) => {
  if (!job) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden border border-white/[0.08] bg-[#111215]">
        <JobDetailInspector
          job={job}
          onClose={onClose}
          onUpdateStatus={onUpdateStatus}
          isUpdating={isUpdating}
          userEmail={userEmail}
        />
      </DialogContent>
    </Dialog>
  );
};
