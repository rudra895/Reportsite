export type BrokerRow = {
  code: string;
  name: string;
  gross: number;
  share: number;
  net: number;
};

export type Employee = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
};

export type SubBroker = {
  id: string;
  code: string;
  name: string | null;
  tag: string | null;
  employee_id: string | null;
};

export type EmployeeRollup = {
  employee_id: string;
  employee_name: string;
  own_code: string | null;
  own_net: number;        // 100% of own code
  shared_net: number;     // 50% of mapped sub-brokers (employee gets this)
  ganpat_net: number;     // the other 50% of mapped sub-brokers (goes to Ganpat)
  total: number;          // employee total = own_net + shared_net
  mapped_codes: string[];
};
