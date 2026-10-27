from pydantic import BaseModel, ConfigDict, Field


class DataFlowNodeOut(BaseModel):
    id: str
    label: str
    kind: str  # "central" | "gateway" | "plc"
    group: str | None = None
    station_id: str | None = None
    station_name: str | None = None


class DataFlowEdgeOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    source: str = Field(alias="from")
    target: str = Field(alias="to")
    type: str


class DataFlowGraphOut(BaseModel):
    nodes: list[DataFlowNodeOut]
    edges: list[DataFlowEdgeOut]
