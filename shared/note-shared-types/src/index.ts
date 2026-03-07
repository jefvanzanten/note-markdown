export type TabDto = {
  tab_id: string;
  title: string;
  is_temp: boolean;
  is_dirty: boolean;
  linked_path: string | null;
  content: string;
  cursor: number;
};

export type SaveResultDto = {
  tab: TabDto;
};

export type Ack = {
  ok: boolean;
};
